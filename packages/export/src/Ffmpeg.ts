import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import type * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import ffmpegStatic from "ffmpeg-static";

type Spawner = ChildProcessSpawner.ChildProcessSpawner;

/**
 * ffmpeg encoding is an export tool, not a renderer: it consumes the PNG
 * frames the rasterizer produces and pipes them into ffmpeg over stdin
 * (`-f image2pipe`), yielding a video file. No frame touches disk.
 *
 * By default the bundled `ffmpeg-static` binary is used (a full build with
 * libx264, so H.264 works out of the box); `binary` overrides it to point
 * at a system or custom ffmpeg. If the bundle is unavailable for the host
 * platform, it falls back to `"ffmpeg"` on PATH. Process spawning goes
 * through the `ChildProcessSpawner` service — the consumer provides it
 * (e.g. `NodeServices.layer` from `@effect/platform-node`), the same way
 * `Resvg.rasterizeToFile` takes a consumer-provided `FileSystem`.
 */

// the bundled ffmpeg (null only on a platform ffmpeg-static doesn't ship)
const bundledFfmpeg: string | null = ffmpegStatic;

/** Options for {@link encode}. */
export interface EncodeOptions {
	/** Input framerate handed to ffmpeg (`-framerate`). */
	readonly frameRate: number;
	/**
	 * ffmpeg binary; defaults to the bundled `ffmpeg-static` build (falling
	 * back to `"ffmpeg"` on PATH). Set to `"ffmpeg"` or a path to use a
	 * system/custom ffmpeg instead.
	 */
	readonly binary?: string | undefined;
	/**
	 * Extra ffmpeg arguments appended before the output path — e.g.
	 * `["-crf", "18"]` or a `-vf` scale filter. Escape hatch for the codec
	 * surface this wrapper does not model.
	 */
	readonly extraArgs?: ReadonlyArray<string> | undefined;
}

/**
 * A failure encoding a video: ffmpeg not spawnable (not installed / not on
 * PATH), or a nonzero exit. `stderr` carries ffmpeg's diagnostics when the
 * process ran; it is empty when the binary could not be spawned at all.
 */
export class EncodeError extends Data.TaggedError("EncodeError")<{
	readonly message: string;
	readonly stderr: string;
	readonly cause: unknown;
}> {}

// broadly-playable defaults: H.264 8-bit, faststart MP4 for progressive
// playback. Flags chosen to be stable across every maintained ffmpeg (4.x+).
const outputArgs = [
	"-c:v",
	"libx264",
	"-pix_fmt",
	"yuv420p",
	"-movflags",
	"+faststart",
];

const decoder = new TextDecoder();

/**
 * Encode a stream of PNG frames into a video file at `outPath`.
 *
 * Pipes the PNG bytes into ffmpeg's stdin via the `image2pipe` demuxer;
 * when the stream ends, stdin closes and ffmpeg finalizes the file. A
 * nonzero exit or an unspawnable binary fails with a tagged
 * {@link EncodeError}.
 */
export const encode = (
	pngStream: Stream.Stream<Uint8Array>,
	outPath: string,
	options: EncodeOptions,
): Effect.Effect<void, EncodeError, Spawner> =>
	Effect.gen(function* () {
		const binary = options.binary ?? bundledFfmpeg ?? "ffmpeg";
		const args = [
			"-f",
			"image2pipe",
			"-framerate",
			String(options.frameRate),
			"-i",
			"-",
			...outputArgs,
			...(options.extraArgs ?? []),
			"-y",
			outPath,
		];

		const command = ChildProcess.make(binary, args, {
			// PlatformError from the stdin pipe would otherwise leak into the
			// stream's error channel; the stream elements are pure PNG bytes,
			// so this cast only re-labels the (unreachable) error type
			stdin: pngStream as Stream.Stream<
				Uint8Array,
				PlatformError.PlatformError
			>,
			stdout: "ignore",
			stderr: "pipe",
		});

		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

		yield* Effect.scoped(
			Effect.gen(function* () {
				const handle = yield* spawner.spawn(command);
				// collect stderr concurrently: an unconsumed stderr pipe can
				// fill and deadlock ffmpeg, and it is the error diagnostic
				const stderrFiber = yield* Effect.forkChild(
					Stream.runFold(
						handle.stderr,
						() => "",
						(acc, chunk) => acc + decoder.decode(chunk),
					),
				);
				const code = yield* handle.exitCode;
				const stderr = yield* Fiber.join(stderrFiber);
				if (code !== 0) {
					return yield* new EncodeError({
						message: `ffmpeg exited with code ${code}`,
						stderr,
						cause: code,
					});
				}
			}),
		).pipe(
			Effect.catchTag("PlatformError", (cause) =>
				Effect.fail(
					new EncodeError({
						message: `Could not run "${binary}". Install ffmpeg and ensure it is on your PATH (or pass options.binary).`,
						stderr: "",
						cause,
					}),
				),
			),
		);
	});
