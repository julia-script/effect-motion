import { Effect, Layer } from "effect";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import {
	type ChildProcess,
	ChildProcessSpawner,
} from "effect/unstable/process";
import ffmpegStatic from "ffmpeg-static";
import { expect, it } from "vitest";
import { Ffmpeg } from "../src";

interface SpawnRecord {
	command: string;
	args: ReadonlyArray<string>;
	stdinBytes: number;
}

/**
 * A mock `ChildProcessSpawner` that records the spawned command, drains the
 * stdin stream (counting bytes), and returns a handle with a fixed exit code
 * and stderr text. `spawnError` makes `spawn` itself fail, standing in for a
 * missing binary.
 */
const mockSpawner = (opts: {
	exitCode?: number;
	stderr?: string;
	spawnError?: boolean;
	record?: SpawnRecord[];
}) => {
	const spawn = (command: ChildProcess.Command) =>
		Effect.gen(function* () {
			if (opts.spawnError) {
				return yield* Effect.fail(
					// a PlatformError-shaped failure; encode re-tags it
					{ _tag: "PlatformError", message: "spawn ENOENT" } as never,
				);
			}
			const std = command as ChildProcess.StandardCommand;
			const stdin = std.options.stdin as Stream.Stream<Uint8Array> | undefined;
			let stdinBytes = 0;
			if (stdin && Stream.isStream(stdin)) {
				stdinBytes = yield* Stream.runFold(
					stdin,
					() => 0,
					(acc, chunk) => acc + chunk.length,
				);
			}
			opts.record?.push({ command: std.command, args: std.args, stdinBytes });
			return ChildProcessSpawner.makeHandle({
				pid: ChildProcessSpawner.ProcessId(1),
				exitCode: Effect.succeed(
					ChildProcessSpawner.ExitCode(opts.exitCode ?? 0),
				),
				isRunning: Effect.succeed(false),
				kill: () => Effect.void,
				stdin: Sink.drain,
				stdout: Stream.empty,
				stderr: Stream.encodeText(Stream.make(opts.stderr ?? "")),
				all: Stream.empty,
				getInputFd: () => Sink.drain,
				getOutputFd: () => Stream.empty,
				unref: Effect.succeed(Effect.void),
			});
		});

	return Layer.succeed(
		ChildProcessSpawner.ChildProcessSpawner,
		ChildProcessSpawner.ChildProcessSpawner.of(
			ChildProcessSpawner.make(spawn as never),
		),
	);
};

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

it("spawns ffmpeg with image2pipe defaults and pipes PNG bytes to stdin", async () => {
	const record: SpawnRecord[] = [];
	await Effect.runPromise(
		Ffmpeg.encode(Stream.make(png, png), "out.mp4", { frameRate: 30 }).pipe(
			Effect.provide(mockSpawner({ record })),
		),
	);

	expect(record).toHaveLength(1);
	const { command, args, stdinBytes } = record[0]!;
	// defaults to the bundled ffmpeg-static binary (falls back to "ffmpeg"
	// only where ffmpeg-static ships no build)
	expect(command).toBe(ffmpegStatic ?? "ffmpeg");
	expect(args).toEqual([
		"-f",
		"image2pipe",
		"-framerate",
		"30",
		"-i",
		"-",
		"-c:v",
		"libx264",
		"-pix_fmt",
		"yuv420p",
		"-movflags",
		"+faststart",
		"-y",
		"out.mp4",
	]);
	expect(stdinBytes).toBe(png.length * 2);
});

it("honors custom binary and appends extraArgs before the output path", async () => {
	const record: SpawnRecord[] = [];
	await Effect.runPromise(
		Ffmpeg.encode(Stream.make(png), "clip.mp4", {
			frameRate: 24,
			binary: "/opt/ffmpeg/bin/ffmpeg",
			extraArgs: ["-crf", "18"],
		}).pipe(Effect.provide(mockSpawner({ record }))),
	);

	const { command, args } = record[0]!;
	expect(command).toBe("/opt/ffmpeg/bin/ffmpeg");
	// extraArgs sit after the default output flags, before -y/output
	expect(args.slice(-4)).toEqual(["-crf", "18", "-y", "clip.mp4"]);
});

it("fails typed with stderr when ffmpeg exits nonzero", async () => {
	const failure = await Effect.runPromise(
		Effect.flip(
			Ffmpeg.encode(Stream.make(png), "out.mp4", { frameRate: 30 }).pipe(
				Effect.provide(
					mockSpawner({ exitCode: 1, stderr: "Invalid argument\n" }),
				),
			),
		),
	);

	expect(failure._tag).toBe("EncodeError");
	expect(failure).toBeInstanceOf(Ffmpeg.EncodeError);
	expect(failure.stderr).toContain("Invalid argument");
	expect(failure.message).toContain("code 1");
});

it("fails typed with install guidance when the binary cannot be spawned", async () => {
	const failure = await Effect.runPromise(
		Effect.flip(
			Ffmpeg.encode(Stream.make(png), "out.mp4", { frameRate: 30 }).pipe(
				Effect.provide(mockSpawner({ spawnError: true })),
			),
		),
	);

	expect(failure._tag).toBe("EncodeError");
	expect(failure.message).toMatch(/install ffmpeg/i);
});
