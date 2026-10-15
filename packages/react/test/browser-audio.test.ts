import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Audio from "effect-motion/Audio";
import type * as Scene from "effect-motion/Scene";
import * as MotionScene from "effect-motion/Scene";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as BrowserAudio from "../src/BrowserAudio";

class FakeParam {
	value = 1;
	ramps: Array<{ value: number; at: number }> = [];
	setValueAtTime(value: number) {
		this.value = value;
	}
	cancelScheduledValues() {}
	linearRampToValueAtTime(value: number, at: number) {
		this.ramps.push({ value, at });
		this.value = value;
	}
}

class FakeSource {
	buffer: AudioBuffer | null = null;
	loop = false;
	starts: number[] = [];
	stops = 0;
	connect() {}
	disconnect() {}
	start(_when: number, offset: number) {
		this.starts.push(offset);
	}
	stop() {
		this.stops++;
	}
}

class FakeGain {
	gain = new FakeParam();
	connect() {}
	disconnect() {}
}

class FakeContext {
	static all: FakeContext[] = [];
	static failDecode = false;
	currentTime = 0;
	state: AudioContextState = "suspended";
	destination = {};
	sources: FakeSource[] = [];
	gains: FakeGain[] = [];
	decodeCount = 0;
	constructor() {
		FakeContext.all.push(this);
	}
	resume = vi.fn(async () => {
		this.state = "running";
	});
	close = vi.fn(async () => {
		this.state = "closed";
	});
	decodeAudioData = vi.fn(async (_bytes: ArrayBuffer) => {
		this.decodeCount++;
		if (FakeContext.failDecode) throw new Error("bad file");
		return { duration: 2 } as AudioBuffer;
	});
	createBufferSource() {
		const source = new FakeSource();
		this.sources.push(source);
		return source;
	}
	createGain() {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	}
}

const track = Audio.Audio("theme");
const bytes = new Uint8Array([1, 2, 3]);
const frame = (
	_index: number,
	entries: Array<{
		id: string;
		time: number;
		gain?: number;
		loop?: boolean;
		playing?: boolean;
	}>,
): Scene.Frame => {
	const instances: Scene.Frame["instances"] = {
		root: {
			data: { _tag: "Group", children: entries.map((e) => e.id) },
		} as unknown as Scene.Frame["instances"][string],
	};
	for (const entry of entries) {
		instances[entry.id] = {
			data: {
				_tag: "Audio",
				audio: { _tag: Audio.tag, id: track.id },
				time: entry.time,
				gain: entry.gain ?? 1,
				loop: entry.loop ?? false,
				playing: entry.playing ?? true,
			},
		} as Scene.Frame["instances"][string];
	}
	return { root: "root", instances, frameRate: 30 } as Scene.Frame;
};

const withAudio = (
	f: (
		audio: BrowserAudio.BrowserAudio,
		context: FakeContext,
	) => Effect.Effect<void, unknown>,
) =>
	Effect.scoped(
		Effect.gen(function* () {
			const ref: BrowserAudio.ContextRef = { current: null };
			const audio = yield* BrowserAudio.make(ref);
			yield* audio.unlock;
			const context = FakeContext.all.at(-1);
			if (context === undefined)
				return yield* Effect.die("missing fake context");
			yield* f(audio, context);
		}),
	).pipe(Effect.provide(Audio.layer(track, Effect.succeed(bytes))));

afterEach(() => {
	vi.unstubAllGlobals();
	FakeContext.all = [];
	FakeContext.failDecode = false;
});

describe("browser audio source manager", () => {
	it("starts once per instance, stops at source end and when removed", async () => {
		vi.stubGlobal("AudioContext", FakeContext);
		await Effect.runPromise(
			withAudio((audio, context) =>
				Effect.gen(function* () {
					yield* audio.sync(
						frame(0, [
							{ id: "a", time: 0 },
							{ id: "b", time: 0.5 },
						]),
						0,
						true,
					);
					expect(context.decodeCount).toBe(1);
					expect(context.sources.map((source) => source.starts)).toEqual([
						[0],
						[0.5],
					]);
					yield* audio.sync(
						frame(1, [
							{ id: "a", time: 2 },
							{ id: "b", time: 0.5, playing: false },
						]),
						1,
						true,
					);
					expect(context.sources.map((source) => source.stops)).toEqual([1, 1]);
					yield* audio.sync(frame(2, [{ id: "c", time: 0 }]), 2, true);
					yield* audio.sync(frame(3, []), 3, true);
					expect(context.sources[2]?.stops).toBe(1);
				}),
			),
		);
	});

	it("wraps a loop and re-seeks only past the continuity or clock threshold", async () => {
		vi.stubGlobal("AudioContext", FakeContext);
		await Effect.runPromise(
			withAudio((audio, context) =>
				Effect.gen(function* () {
					yield* audio.sync(
						frame(0, [{ id: "a", time: 1.9, loop: true }]),
						0,
						true,
					);
					expect(context.sources[0]?.starts).toEqual([1.9]);
					context.currentTime = 0.1;
					yield* audio.sync(
						frame(3, [{ id: "a", time: 2, loop: true }]),
						3,
						true,
					);
					expect(context.sources).toHaveLength(1);
					context.currentTime = 0.2;
					yield* audio.sync(
						frame(4, [{ id: "a", time: 2.5, loop: true }]),
						4,
						true,
					);
					expect(context.sources[0]?.stops).toBe(1);
					expect(context.sources[1]?.starts).toEqual([0.5]);
					context.currentTime = 0.4;
					yield* audio.sync(
						frame(5, [{ id: "a", time: 2.5 + 1 / 30, loop: true }]),
						5,
						true,
					);
					expect(context.sources).toHaveLength(3);
				}),
			),
		);
	});

	it("follows gain, pauses, and cleans up on scope close", async () => {
		vi.stubGlobal("AudioContext", FakeContext);
		await Effect.runPromise(
			withAudio((audio, context) =>
				Effect.gen(function* () {
					yield* audio.sync(frame(0, [{ id: "a", time: 0, gain: 0 }]), 0, true);
					context.currentTime = 1 / 30;
					yield* audio.sync(
						frame(1, [{ id: "a", time: 1 / 30, gain: 0.6 }]),
						1,
						true,
					);
					expect(context.gains[0]?.gain.ramps).toEqual([
						{ value: 0.6, at: 2 / 30 },
					]);
					yield* audio.sync(frame(2, [{ id: "a", time: 2 / 30 }]), 2, false);
					expect(context.sources[0]?.stops).toBe(1);
					yield* audio.sync(frame(3, [{ id: "a", time: 3 / 30 }]), 3, true);
				}),
			),
		);
		expect(FakeContext.all[0]?.sources[1]?.stops).toBe(1);
		expect(FakeContext.all[0]?.close).toHaveBeenCalled();
	});

	it("prepares duration from decoded playback bytes and reports decode failure", async () => {
		vi.stubGlobal("AudioContext", FakeContext);
		const layer = BrowserAudio.prepare(track, Effect.succeed(bytes));
		const duration = await Effect.runPromise(
			Audio.duration(track).pipe(Effect.provide(layer)),
		);
		expect(duration).toBeDefined();
		expect(FakeContext.all[0]?.decodeCount).toBe(1);
		const scene = MotionScene.make(function* () {
			yield* MotionScene.sleep(yield* Audio.duration(track));
		});
		const frames = await Effect.runPromise(
			MotionScene.stream(scene, { frameRate: 30 }).pipe(
				Stream.runCollect,
				Effect.provide(BrowserAudio.prepare(track, Effect.succeed(bytes))),
			),
		);
		expect(frames.length).toBeGreaterThan(50);
		FakeContext.failDecode = true;
		const failed = await Effect.runPromiseExit(
			Audio.duration(track).pipe(
				Effect.provide(BrowserAudio.prepare(track, Effect.succeed(bytes))),
			),
		);
		expect(failed._tag).toBe("Failure");
	});

	it("reuses the prepared buffer when the Player starts a source", async () => {
		vi.stubGlobal("AudioContext", FakeContext);
		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					yield* Audio.duration(track);
					const ref: BrowserAudio.ContextRef = { current: null };
					const audio = yield* BrowserAudio.make(ref);
					yield* audio.unlock;
					yield* audio.sync(frame(0, [{ id: "a", time: 0 }]), 0, true);
				}),
			).pipe(
				Effect.provide(BrowserAudio.prepare(track, Effect.succeed(bytes))),
			),
		);
		expect(FakeContext.all.map((context) => context.decodeCount)).toEqual([
			1, 0,
		]);
	});

	it("holds an audible frame when autoplay is blocked but allows silent frames", async () => {
		vi.stubGlobal("AudioContext", FakeContext);
		const ref: BrowserAudio.ContextRef = { current: null };
		await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const audio = yield* BrowserAudio.make(ref);
					expect(yield* audio.sync(frame(0, []), 0, true)).toBe(false);
					expect(
						yield* audio.sync(frame(1, [{ id: "a", time: 0 }]), 1, true),
					).toBe(true);
				}),
			),
		);
	});
});
