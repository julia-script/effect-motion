import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Audio from "../src/Audio.js";
import type * as Entity from "../src/Entity.js";
import * as Motion from "../src/Motion.js";
import type * as Resource from "../src/Resource.js";
import type * as Runner from "../src/Runner.js";
import * as Scene from "../src/Scene.js";
import { unreachable } from "./support/raise.js";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;
type RequirementsOf<T> =
	T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;

const Theme = Audio.Audio("theme");
const Sting = Audio.Audio("sting");
const fps = 30;

type AudioData = Entity.EntityByTag<"Audio">;

const collect = <E, R>(scene: Scene.Scene<E, R>) =>
	Scene.stream(scene, { frameRate: fps }).pipe(
		Stream.runCollect,
		Effect.map((frames) => [...frames]),
	);

// the Audio entries of each frame, in instantiation order
const tracks = (frames: ReadonlyArray<Scene.Frame<unknown>>) =>
	frames.map((frame) =>
		Object.values(frame.instances)
			.map((entry) => entry.data)
			.filter((data): data is AudioData => data._tag === "Audio"),
	);

const run = (
	scene: Scene.Scene<never, Audio.AudioLoader<"theme"> | Runner.Runner>,
) => Effect.runPromise(collect(scene));

// ── requirements ─────────────────────────────────────────────────────────

const referenceOnly = Scene.make(function* () {
	const theme = yield* Theme;
	yield* Audio.play(theme);
	yield* Scene.sleep("100 millis");
});

const withDuration = Scene.make(function* () {
	const theme = yield* Theme;
	yield* Audio.play(theme);
	yield* Scene.sleep(yield* Audio.duration(Theme));
});

type _refResources = Assert<
	Equal<Scene.Resources<typeof referenceOnly>, Audio.AudioLoader<"theme">>
>;
// reference-only: running needs nothing (Scope is closed by the stream)
const referenceProgram = collect(referenceOnly);
type _refRun = Assert<Equal<RequirementsOf<typeof referenceProgram>, never>>;
// an explicit duration query survives loader exclusion
const durationProgram = collect(withDuration);
type _durationRun = Assert<
	Equal<RequirementsOf<typeof durationProgram>, Audio.AudioMetadata<"theme">>
>;
type _metadataNotLoader = Assert<
	Equal<
		Resource.ExcludeLoaders<
			Audio.AudioLoader<"theme"> | Audio.AudioMetadata<"theme">
		>,
		Audio.AudioMetadata<"theme">
	>
>;
type _keep = [_refResources, _refRun, _durationRun, _metadataNotLoader];

describe("Audio requirements", () => {
	it("a reference-only scene produces frames with no bytes", async () => {
		// no cast, no layer: typechecks because the loader is erased
		const frames = await Effect.runPromise(referenceProgram);
		const last = tracks(frames).at(-1)?.[0] ?? unreachable();
		expect(last.audio).toEqual({ _tag: Audio.tag, id: "theme" });
		const keep: [_keep | null] = [null];
		expect(keep).toHaveLength(1);
	});

	it("a duration query needs prepared metadata to run", async () => {
		const program = durationProgram;
		// @ts-expect-error AudioMetadata<"theme"> is not provided
		const _missing: Effect.Effect<unknown, unknown, never> = program;
		const frames = await Effect.runPromise(
			program.pipe(
				Effect.provide(Audio.metadataLayer(Theme, { duration: 0.5 })),
			),
		);
		const reference = await Effect.runPromise(
			collect(
				Scene.make(function* () {
					yield* Scene.sleep("500 millis");
				}),
			),
		);
		expect(frames).toHaveLength(reference.length);
		expect(frames.length).toBeGreaterThan(fps / 2);
	});

	it("preparedLayer inspects exactly the provided bytes, loading once", async () => {
		const bytes = new Uint8Array([1, 2, 3]);
		let loads = 0;
		let inspected: Uint8Array | undefined;
		const layer = Audio.preparedLayer(
			Theme,
			Effect.sync(() => {
				loads++;
				return bytes;
			}),
			(received) =>
				Effect.sync(() => {
					inspected = received;
					return { duration: 2.5 };
				}),
		);
		const [loader, duration] = await Effect.runPromise(
			Effect.all([
				Theme.Loader.useSync((loader) => loader),
				Audio.duration(Theme),
			]).pipe(Effect.provide(layer)),
		);
		expect(loads).toBe(1);
		expect(inspected).toBe(bytes);
		expect(loader.bytes).toBe(bytes);
		expect(Duration.toSeconds(duration)).toBe(2.5);
	});

	it("invalid prepared metadata dies naming the track", async () => {
		const exit = await Effect.runPromiseExit(
			Audio.duration(Theme).pipe(
				Effect.provide(Audio.metadataLayer(Theme, { duration: Number.NaN })),
			),
		);
		expect(Exit.isFailure(exit)).toBe(true);
		expect(String(Exit.isFailure(exit) ? exit.cause : "")).toContain(
			'Audio "theme"',
		);
	});

	it("Audio.layer loads at construction", async () => {
		const loader = await Effect.runPromise(
			Theme.Loader.useSync((loader) => loader).pipe(
				Effect.provide(Audio.layer(Theme, Effect.succeed(new Uint8Array([9])))),
			),
		);
		expect([...loader.bytes]).toEqual([9]);
		expect(
			Layer.isLayer(Audio.layer(Theme, Effect.succeed(new Uint8Array()))),
		).toBe(true);
	});
});

// ── transport ────────────────────────────────────────────────────────────

describe("Audio transport", () => {
	it("time advances 1/fps per frame from the `from` offset", async () => {
		const frames = tracks(
			await run(
				Scene.make(function* () {
					const theme = yield* Theme;
					yield* Audio.play(theme, { from: 2, loop: true, gain: 0.5 });
					yield* Scene.sleep("1 second");
				}),
			),
		);
		frames.forEach((entries, i) => {
			const track = entries[0] ?? unreachable();
			expect(track.time).toBe(2 + i / fps);
			expect(track.playing).toBe(true);
			expect(track.loop).toBe(true);
			expect(track.gain).toBe(0.5);
		});
		expect(frames.at(-1)?.[0]?.time).toBe(3);
	});

	it("a background play does not extend the scene", async () => {
		const withPlay = await run(
			Scene.make(function* () {
				const theme = yield* Theme;
				yield* Audio.play(theme);
				yield* Scene.sleep("10 millis");
				yield* Scene.sleep("300 millis");
			}),
		);
		const without = await run(
			Scene.make(function* () {
				yield* Scene.sleep("10 millis");
				yield* Scene.sleep("300 millis");
			}),
		);
		expect(withPlay).toHaveLength(without.length);
	});

	it("`duration` holds the scene, then pauses", async () => {
		const frames = tracks(
			await run(
				Scene.make(function* () {
					const theme = yield* Theme;
					yield* Audio.play(theme, { duration: "1 second" });
				}),
			),
		);
		expect(frames).toHaveLength(fps + 1);
		const last = frames.at(-1)?.[0] ?? unreachable();
		expect(last.playing).toBe(false);
		expect(last.time).toBe(1);
	});

	it("pause, seek, resume and stop show on the frame they run", async () => {
		const frames = tracks(
			await run(
				Scene.make(function* () {
					const theme = yield* Theme;
					const track = yield* Audio.play(theme);
					yield* Scene.sleep("100 millis"); // frame 3
					yield* Audio.pause(track);
					yield* Scene.sleep("100 millis"); // frame 6
					yield* track.pipe(Audio.seek(5));
					yield* Scene.sleep("100 millis"); // frame 9
					yield* Audio.resume(track);
					yield* Scene.sleep("100 millis"); // frame 12
					yield* Audio.seek(track, 1);
					yield* Scene.sleep("100 millis"); // frame 15
					yield* track.pipe(Audio.stop);
					yield* Scene.sleep("100 millis");
				}),
			),
		).map((entries) => entries[0] ?? unreachable());
		const at = (i: number) => frames[i] ?? unreachable();
		expect(at(3)).toMatchObject({ time: 3 / fps, playing: false });
		expect(at(5)).toMatchObject({ time: 3 / fps, playing: false });
		expect(at(6)).toMatchObject({ time: 5, playing: false });
		expect(at(8)).toMatchObject({ time: 5, playing: false });
		expect(at(9)).toMatchObject({ time: 5, playing: true });
		expect(at(11)).toMatchObject({ time: 5 + 2 / fps, playing: true });
		expect(at(12)).toMatchObject({ time: 1, playing: true });
		expect(at(14)).toMatchObject({ time: 1 + 2 / fps, playing: true });
		expect(at(15)).toMatchObject({ time: 0, playing: false });
		expect(at(17)).toMatchObject({ time: 0, playing: false });
	});

	it("a seek from another branch lands on its frame regardless of fiber order", async () => {
		const frames = tracks(
			await run(
				Scene.make(function* () {
					const theme = yield* Theme;
					const track = yield* Audio.play(theme);
					yield* Scene.fork(
						Scene.sleep("100 millis").pipe(
							Effect.andThen(Audio.seek(track, 10)),
						),
					);
					yield* Scene.sleep("200 millis");
				}),
			),
		).map((entries) => entries[0] ?? unreachable());
		expect(frames[2]?.time).toBe(2 / fps);
		expect(frames[3]?.time).toBe(10);
		expect(frames[4]?.time).toBe(10 + 1 / fps);
	});
});

// ── gain ─────────────────────────────────────────────────────────────────

const gainsOf = async (
	body: (
		theme: Audio.Audio<"theme">,
		sting: Audio.Audio<"sting">,
	) => Effect.Effect<unknown, never, Runner.Runner>,
) =>
	tracks(
		await Effect.runPromise(
			collect(
				Scene.make(function* () {
					const theme = yield* Theme;
					const sting = yield* Sting;
					yield* body(theme, sting);
				}),
			),
		),
	).map((entries) => entries.map((track) => track.gain));

describe("Audio gain", () => {
	it("fadeIn and fadeOut land exactly on their endpoints", async () => {
		const gains = await gainsOf((theme) =>
			Effect.gen(function* () {
				const track = yield* Audio.play(theme);
				yield* track.pipe(Audio.fadeIn("200 millis")); // frames 0..5
				yield* Audio.fadeOut(track, "200 millis"); // frames 6..11
			}),
		);
		// animators write on the frame they start: step i lands on frame i − 1
		expect(gains[0]?.[0]).toBeCloseTo(1 / 6);
		expect(gains[5]?.[0]).toBe(1);
		expect(gains[11]?.[0]).toBe(0);
	});

	it("fade / fadeTo and Motion.tweenTo({ gain }) are exact", async () => {
		const gains = await gainsOf((theme) =>
			Effect.gen(function* () {
				const track = yield* Audio.play(theme);
				yield* Audio.fade(track, 0.2, 0.8, "100 millis", "easeInOutCubic");
				yield* track.pipe(Audio.fadeTo(0.3, "100 millis"));
				yield* Motion.tweenTo(track, { gain: 0.25 }, "100 millis");
			}),
		);
		expect(gains[2]?.[0]).toBe(0.8);
		expect(gains[5]?.[0]).toBe(0.3);
		expect(gains[8]?.[0]).toBe(0.25);
	});

	it("crossfade runs both at once and lands exactly", async () => {
		const gains = await gainsOf((theme, sting) =>
			Effect.gen(function* () {
				const a = yield* Audio.play(theme);
				const b = yield* Audio.play(sting, { gain: 0 });
				const incoming = yield* Audio.crossfade(a, b, "200 millis");
				expect(incoming).toBe(b);
				yield* a.pipe(Audio.crossfade(b, "100 millis"));
			}),
		);
		const [aFirst, bFirst] = gains[0] ?? unreachable();
		expect(aFirst).toBeGreaterThan(0);
		expect(aFirst).toBeLessThan(1);
		expect(bFirst).toBeGreaterThan(0);
		expect(bFirst).toBeLessThan(1);
		expect(gains[5]).toEqual([0, 1]);
		expect(gains[8]).toEqual([0, 1]);
	});

	it("Motion.fade is visual only: a compile error on audio", () => {
		const _gated = (track: Audio.Audio<"theme">) =>
			Effect.gen(function* () {
				const instance = yield* Audio.play(track);
				// @ts-expect-error Audio has no opacity
				yield* Motion.fadeTo(instance, 0, "1 second");
			});
		expect(_gated).toBeTypeOf("function");
	});
});

// ── clips, precedence, direct writes, continuity ─────────────────────────

const audioFrames = (
	body: (
		theme: Audio.Audio<"theme">,
	) => Effect.Effect<unknown, never, Runner.Runner>,
	frameRate = fps,
) =>
	Effect.runPromise(
		Scene.stream(
			Scene.make(function* () {
				const theme = yield* Theme;
				yield* body(theme);
			}),
			{ frameRate },
		).pipe(
			Stream.runCollect,
			Effect.map((frames) =>
				tracks([...frames]).map((entries) => entries[0] ?? unreachable()),
			),
		),
	);

describe("Audio clips", () => {
	const clipEndsAt30 = (frames: ReadonlyArray<AudioData>) => {
		expect(frames.length).toBeGreaterThan(60);
		expect(frames[29]).toMatchObject({ playing: true, time: 29 / fps });
		expect(frames[30]).toMatchObject({ playing: false, time: 1 });
		expect(frames.at(-1)).toMatchObject({ playing: false, time: 1 });
	};

	it("a clip inside Scene.all ends on its frame while the scene continues", async () => {
		clipEndsAt30(
			await audioFrames((theme) =>
				Effect.gen(function* () {
					yield* Scene.all([
						Audio.play(theme, { duration: "1 second" }),
						Scene.sleep("100 millis"),
					]);
					yield* Scene.sleep("2 seconds");
				}),
			),
		);
	});

	it("a clip inside a finished fork ends on its frame while the scene continues", async () => {
		clipEndsAt30(
			await audioFrames((theme) =>
				Effect.gen(function* () {
					yield* Scene.fork(Audio.play(theme, { duration: "1 second" }));
					yield* Scene.sleep("2 seconds");
				}),
			),
		);
	});

	it("a zero-duration clip is paused on its first frame", async () => {
		const frames = await audioFrames((theme) =>
			Effect.gen(function* () {
				yield* Audio.play(theme, { from: 3, duration: 0 });
				yield* Scene.sleep("100 millis");
			}),
		);
		for (const frame of frames) {
			expect(frame).toMatchObject({ playing: false, time: 3 });
		}
	});

	it("a looped clip keeps loop and ends on the unwrapped cursor", async () => {
		const frames = await audioFrames((theme) =>
			Effect.gen(function* () {
				yield* Audio.play(theme, {
					from: 0.5,
					loop: true,
					duration: "2 seconds",
				});
				yield* Scene.sleep("3 seconds");
			}),
		);
		expect(frames[59]).toMatchObject({ playing: true, loop: true });
		expect(frames[60]).toMatchObject({ playing: false, loop: true, time: 2.5 });
		expect(frames.at(-1)).toMatchObject({ playing: false, time: 2.5 });
	});

	it("stop then resume cancels the clip end", async () => {
		const frames = await audioFrames((theme) =>
			Effect.gen(function* () {
				const track = yield* Audio.play(theme, { duration: "1 second" });
				yield* Scene.sleep("500 millis"); // frame 15
				yield* Audio.stop(track);
				yield* Scene.sleep("100 millis"); // frame 18
				yield* Audio.resume(track);
				yield* Scene.sleep("1 second"); // frame 48
			}),
		);
		expect(frames[15]).toMatchObject({ playing: false, time: 0 });
		expect(frames[18]).toMatchObject({ playing: true, time: 0 });
		expect(frames[30]).toMatchObject({ playing: true, time: 12 / fps });
		expect(frames[48]).toMatchObject({ playing: true, time: 1 });
	});

	it("a seek while playing cancels the clip end", async () => {
		const frames = await audioFrames((theme) =>
			Effect.gen(function* () {
				const track = yield* Audio.play(theme, { duration: "1 second" });
				yield* Scene.sleep("500 millis");
				yield* Audio.seek(track, 10);
				yield* Scene.sleep("1 second");
			}),
		);
		expect(frames[15]).toMatchObject({ playing: true, time: 10 });
		expect(frames[45]).toMatchObject({ playing: true, time: 11 });
	});

	it("the clip still holds the scene when played from the body", async () => {
		const frames = await audioFrames((theme) =>
			Audio.play(theme, { duration: "500 millis" }),
		);
		expect(frames).toHaveLength(16);
		expect(frames.at(-1)).toMatchObject({ playing: false, time: 0.5 });
	});
});

describe("Audio direct writes", () => {
	it("writing playing/time acts as pause, resume and seek on that frame", async () => {
		const frames = await audioFrames((theme) =>
			Effect.gen(function* () {
				const track = yield* Scene.instantiate("Audio", {
					audio: theme,
					time: 1,
					playing: true,
				});
				yield* Scene.sleep("100 millis"); // frame 3
				yield* Scene.update(track, (d) => ({ ...d, playing: false }));
				yield* Scene.sleep("100 millis"); // frame 6
				yield* Scene.update(track, (d) => ({ ...d, playing: true }));
				yield* Scene.sleep("100 millis"); // frame 9
				yield* Scene.update(track, (d) => ({ ...d, time: 7 }));
				yield* Scene.sleep("100 millis");
			}),
		);
		expect(frames[0]).toMatchObject({ playing: true, time: 1 });
		expect(frames[3]).toMatchObject({ playing: false, time: 1 + 3 / fps });
		expect(frames[5]).toMatchObject({ playing: false, time: 1 + 3 / fps });
		expect(frames[6]).toMatchObject({ playing: true, time: 1 + 3 / fps });
		expect(frames[8]?.time).toBeCloseTo(1 + 5 / fps, 12);
		expect(frames[9]).toMatchObject({ playing: true, time: 7 });
		expect(frames[11]?.time).toBeCloseTo(7 + 2 / fps, 12);
	});
});

describe("Audio.isContinuous", () => {
	const steps = [1, 2, 3, 5, 7] as const;
	for (const rate of [24, 30, 60]) {
		it(`continuous and skipped frames stay continuous at ${rate}fps; seeks do not`, async () => {
			const frames = await audioFrames(
				(theme) =>
					Effect.gen(function* () {
						const track = yield* Audio.play(theme, { from: 0.123 });
						yield* Scene.sleep("10 seconds");
						yield* Audio.seek(track, 3);
						yield* Scene.sleep("100 millis");
						yield* Audio.pause(track);
						yield* Scene.sleep("100 millis");
					}),
				rate,
			);
			const seekFrame = 10 * rate;
			// every consecutive pair before the seek
			for (let k = 1; k < seekFrame; k++) {
				const ok = Audio.isContinuous(
					frames[k - 1] ?? unreachable(),
					frames[k] ?? unreachable(),
					1,
					rate,
				);
				expect(ok).toBe(true);
			}
			// sparse sampling: skipped frames account for elapsed time
			let k = 0;
			for (let i = 0; k < seekFrame - 8; i++) {
				const step = steps[i % steps.length] ?? 1;
				const ok = Audio.isContinuous(
					frames[k] ?? unreachable(),
					frames[k + step] ?? unreachable(),
					step,
					rate,
				);
				expect(ok).toBe(true);
				k += step;
			}
			// the seek, and the pause after it, are discontinuities
			const before = frames[seekFrame - 1] ?? unreachable();
			const seeked = frames[seekFrame] ?? unreachable();
			expect(Audio.isContinuous(before, seeked, 1, rate)).toBe(false);
			const pauseFrame = seekFrame + Math.round(rate / 10);
			expect(
				Audio.isContinuous(
					frames[pauseFrame - 1] ?? unreachable(),
					frames[pauseFrame] ?? unreachable(),
					1,
					rate,
				),
			).toBe(false);
			// a strict prev + 1/fps equality would have misfired on float noise
			const strictMisses = frames
				.slice(1, seekFrame)
				.filter(
					(f, i) => f.time !== (frames[i] ?? unreachable()).time + 1 / rate,
				).length;
			expect(strictMisses).toBeGreaterThan(0);
		});
	}
});
