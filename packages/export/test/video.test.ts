import { Effect, Layer } from "effect";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import {
	type ChildProcess,
	ChildProcessSpawner,
} from "effect/unstable/process";
import { Color, Entities as S, Scene } from "effect-motion";
import { expect, it } from "vitest";
import { Ffmpeg, Video } from "../src";

interface SpawnRecord {
	args: ReadonlyArray<string>;
	pngFrames: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// count PNG frames by counting PNG signatures in the concatenated stdin bytes
const countPngs = (bytes: Uint8Array): number => {
	let count = 0;
	outer: for (let i = 0; i + PNG_SIG.length <= bytes.length; i++) {
		for (let j = 0; j < PNG_SIG.length; j++) {
			if (bytes[i + j] !== PNG_SIG[j]) continue outer;
		}
		count++;
	}
	return count;
};

const mockSpawner = (record: SpawnRecord[], bytesOut?: number[]) => {
	const spawn = (command: ChildProcess.Command) =>
		Effect.gen(function* () {
			const std = command as ChildProcess.StandardCommand;
			const stdin = std.options.stdin as Stream.Stream<Uint8Array> | undefined;
			const chunks: number[] = [];
			if (stdin && Stream.isStream(stdin)) {
				yield* Stream.runForEach(stdin, (chunk) =>
					Effect.sync(() => {
						for (const b of chunk) chunks.push(b);
					}),
				);
			}
			record.push({
				args: std.args,
				pngFrames: countPngs(new Uint8Array(chunks)),
			});
			bytesOut?.push(...chunks);
			return ChildProcessSpawner.makeHandle({
				pid: ChildProcessSpawner.ProcessId(1),
				exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
				isRunning: Effect.succeed(false),
				kill: () => Effect.void,
				stdin: Sink.drain,
				stdout: Stream.empty,
				stderr: Stream.empty,
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

// a short scene at 200x120 (even dims); 3 ticks emit 4 frames (the initial
// state plus one per tick)
const EXPECTED_FRAMES = 4;
const frameBody = function* () {
	yield* Scene.instantiate("Circle", {
		position: S.vec3({ x: 40, y: 40 }),
		radius: 20,
		fillColor: Color.hex("#fde68a"),
	});
	yield* Scene.tick;
	yield* Scene.tick;
	yield* Scene.tick;
};
const threeFrameScene = Scene.make(frameBody, { width: 200, height: 120 });
// odd width: invalid for yuv420p — must be rejected before ffmpeg spawns
const oddScene = Scene.make(frameBody, { width: 201, height: 120 });

const evenSettings = { frameRate: 30 } as const;

it("streams a scene to N PNG frames at the scene's framerate", async () => {
	const record: SpawnRecord[] = [];
	await Effect.runPromise(
		Video.render(threeFrameScene, "out.mp4", { settings: evenSettings }).pipe(
			Effect.provide(mockSpawner(record)),
		),
	);

	expect(record).toHaveLength(1);
	expect(record[0]?.pngFrames).toBe(EXPECTED_FRAMES);
	// framerate is read from metadata, not repeated by the caller
	const args = record[0]?.args ?? [];
	expect(args[args.indexOf("-framerate") + 1]).toBe("30");
});

// PNG IHDR: width/height are big-endian u32 at byte offsets 16 and 20
const pngDims = (bytes: Uint8Array): [number, number] => {
	const view = new DataView(bytes.buffer, bytes.byteOffset);
	return [view.getUint32(16), view.getUint32(20)];
};

it("supersamples frames by options.dpr without changing framing", async () => {
	const record: SpawnRecord[] = [];
	const stdin: number[] = [];
	await Effect.runPromise(
		Video.render(threeFrameScene, "out.mp4", {
			settings: evenSettings,
			dpr: 2,
		}).pipe(Effect.provide(mockSpawner(record, stdin))),
	);

	expect(record[0]?.pngFrames).toBe(EXPECTED_FRAMES);
	expect(pngDims(new Uint8Array(stdin))).toEqual([400, 240]);
});

it("rejects odd output dimensions before spawning ffmpeg", async () => {
	const record: SpawnRecord[] = [];
	const failure = await Effect.runPromise(
		Effect.flip(
			Video.render(oddScene, "out.mp4", {
				settings: {},
			}).pipe(Effect.provide(mockSpawner(record))),
		),
	);

	expect(failure).toBeInstanceOf(Ffmpeg.EncodeError);
	expect((failure as Ffmpeg.EncodeError).message).toContain("201");
	// no ffmpeg was spawned
	expect(record).toHaveLength(0);
});

it("caps an infinite scene with options.frames", async () => {
	const infinite = Scene.make(
		function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 10, y: 10 }),
				radius: 5,
				fillColor: Color.hex("#fff"),
			});
			while (true) {
				yield* Scene.tick;
			}
		},
		{ width: 200, height: 120 },
	);
	const record: SpawnRecord[] = [];
	await Effect.runPromise(
		Video.render(infinite, "out.mp4", {
			frames: 10,
			settings: { ...evenSettings, maxFrames: Number.POSITIVE_INFINITY },
		}).pipe(Effect.provide(mockSpawner(record))),
	);

	expect(record[0]?.pngFrames).toBe(10);
});
