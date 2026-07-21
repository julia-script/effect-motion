import { Effect, Schedule } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import * as S from "../src/schemas";
import * as Time from "../src/Time";
import { unreachable } from "./support/raise";
import { whileInputBelow } from "./support/schedule";

const run = <A>(eff: Effect.Effect<A, any, never>): Promise<A> =>
	Effect.runPromise(eff);

describe("schedule driver", () => {
	it("evaluates in scene time and returns absolute target frames", () =>
		run(
			Effect.gen(function* () {
				const driver = yield* Time.scheduleDriver(Schedule.spaced(1000), 60);
				const first = yield* driver.next(0, null);
				expect(first).toEqual({ done: false, output: 0, frame: 60 });
				// spaced is relative to the decision moment, not to frame 0
				const second = yield* driver.next(90, null);
				expect(second).toEqual({ done: false, output: 1, frame: 150 });
			}),
		));

	it("resolves each absolute target once to the frame at/after it — no drift", () =>
		run(
			Effect.gen(function* () {
				const driver = yield* Time.scheduleDriver(Schedule.fixed(333), 60);
				let frame = 0;
				const frames: number[] = [];
				for (let i = 0; i < 6; i++) {
					const decision = yield* driver.next(frame, null);
					if (decision.done) {
						break;
					}
					frames.push(decision.frame);
					frame = decision.frame;
				}
				// true boundaries 333, 666, ... each resolved once, absolutely
				expect(frames).toEqual(
					[333, 666, 999, 1332, 1665, 1998].map((ms) =>
						Math.ceil((ms * 60) / 1000),
					),
				);
			}),
		));

	it("a positive sub-frame delay lands on the NEXT frame, never before its target", () =>
		run(
			Effect.gen(function* () {
				// 1ms after frame 0 is between frames — the first frame at or
				// after the target is frame 1. Resolving to frame 0 would let
				// the next decision happen before the schedule's boundary and
				// wedge stateful schedules like fixed into a same-frame loop.
				const driver = yield* Time.scheduleDriver(Schedule.spaced(1), 60);
				const decision = yield* driver.next(0, null);
				expect(decision).toEqual({ done: false, output: 0, frame: 1 });
			}),
		));

	it("a zero delay (fixed catch-up) is due in the current frame", () =>
		run(
			Effect.gen(function* () {
				const driver = yield* Time.scheduleDriver(Schedule.fixed(100), 60);
				// anchor at frame 0, then arrive far behind the cadence
				yield* driver.next(0, null);
				const behind = yield* driver.next(30, null); // 500ms, boundaries long passed
				expect(behind).toEqual({ done: false, output: 1, frame: 30 });
			}),
		));

	it("a same-frame decision makes progress: repeated steps do not wedge", () =>
		run(
			Effect.gen(function* () {
				// fixed(40) is 2.4 frames; deciding again at the resolved frame
				// must move to the NEXT boundary, not re-emit the same one
				const driver = yield* Time.scheduleDriver(Schedule.fixed(40), 60);
				const first = yield* driver.next(0, null);
				expect(first.done).toBe(false);
				const firstFrame = (first as { frame: number }).frame; // ceil(2.4) = 3
				expect(firstFrame).toBe(3);
				const second = yield* driver.next(firstFrame, null);
				expect((second as { frame: number }).frame).toBeGreaterThan(firstFrame);
			}),
		));

	it("surfaces schedule completion with the final output", () =>
		run(
			Effect.gen(function* () {
				const driver = yield* Time.scheduleDriver(Schedule.recurs(3), 60);
				for (let i = 0; i < 3; i++) {
					expect((yield* driver.next(i, null)).done).toBe(false);
				}
				const last = yield* driver.next(3, null);
				expect(last).toEqual({ done: true, output: 3 });
			}),
		));

	it("feeds the input through to the schedule", () =>
		run(
			Effect.gen(function* () {
				const driver = yield* Time.scheduleDriver(
					Schedule.passthrough(Schedule.spaced(100)),
					60,
				);
				const decision = yield* driver.next(0, "hello");
				expect(decision).toEqual({ done: false, output: "hello", frame: 6 });
			}),
		));
});

// runs a scene and tracks the first non-root instance's x per frame
const trackX = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<number[]> => {
	const scene = Scene.make(make as never, { width: 500, height: 300 });
	const frames = await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		const entry = Object.entries(frame.instances).find(
			([id]) => id !== frame.root,
		)?.[1];
		return (entry ?? unreachable()).data.position.x;
	});
};

describe("Scene.repeat", () => {
	it("spaced: gap measured from run completion, restart from schedule target", async () => {
		const track = await trackX(function* () {
			const circle = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			// 30-frame animation, repeated once, 1 second after it completes
			yield* Scene.repeat(
				Motion.move(circle, { x: 0 }, { x: 100 }, "0.5 seconds"),
				Schedule.spaced("1 second").pipe(Schedule.upTo({ times: 1 })),
			);
		});
		// run 1: 0..29 — gap: 30..89 — run 2: 90..119 — settle frame: 120
		expect(track).toHaveLength(121);
		expect(track[29]).toBe(100);
		for (let i = 30; i < 90; i++) {
			expect(track[i]).toBe(100);
		}
		expect(track[90]).toBeCloseTo(100 / 30, 6); // first step of run 2
		expect(track[119]).toBe(100);
	});

	it("fixed: cadence catch-up, runs never overlap", async () => {
		const track = await trackX(function* () {
			const circle = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			// 30-frame (0.5s) animation on a 0.25s fixed cadence: the cadence
			// anchors at run 1's completion (500ms), so run 2 starts at 750ms;
			// from then on the schedule is behind and runs are back-to-back
			yield* Scene.repeat(
				Motion.move(circle, { x: 0 }, { x: 100 }, "0.5 seconds"),
				Schedule.fixed("0.25 seconds").pipe(Schedule.upTo({ times: 2 })),
			);
		});
		// run 1: 0..29 — gap: 30..44 — run 2: 45..74 — run 3: 75..104 — settle: 105
		expect(track).toHaveLength(106);
		expect(track[44]).toBe(100);
		expect(track[45]).toBeCloseTo(100 / 30, 6); // run 2 after anchor gap
		expect(track[74]).toBe(100);
		expect(track[75]).toBeCloseTo(100 / 30, 6); // run 3 immediately: behind
		expect(track[104]).toBe(100);
	});

	it("recurs(2) runs the effect exactly 3 times", async () => {
		let runs = 0;
		await trackX(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 0 }) });
			yield* Scene.repeat(
				Effect.gen(function* () {
					runs++;
					yield* Scene.tick;
				}),
				Schedule.recurs(2),
			);
		});
		expect(runs).toBe(3);
	});

	it("feeds the run result to the schedule as input", async () => {
		let n = 0;
		await trackX(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 0 }) });
			yield* Scene.repeat(
				Effect.gen(function* () {
					yield* Scene.tick;
					return ++n;
				}),
				whileInputBelow(3),
			);
		});
		// recurs while result < 3: runs produce 1, 2, 3 — stops after 3
		expect(n).toBe(3);
	});

	it("a failing run fails immediately without another run", async () => {
		let runs = 0;
		const attempt = trackX(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 0 }) });
			yield* Scene.repeat(
				Effect.gen(function* () {
					runs++;
					yield* Scene.tick;
					if (runs === 2) {
						yield* Effect.fail(new Error("boom"));
					}
				}),
				Schedule.recurs(5),
			);
		});
		await expect(attempt).rejects.toThrow("boom");
		expect(runs).toBe(2);
	});
});
