import { Effect, Exit, Fiber } from "effect";
import { describe, expect, it } from "vitest";
import * as Phaser from "../src/Phaser";

const anim = (log: string[], name: string) =>
	Effect.sync(() => {
		log.push(name);
	});

const runTest = <A, E>(effect: Effect.Effect<A, E, never>) =>
	Effect.runPromise(
		Effect.timeoutOrElse(effect, {
			duration: 1000,
			orElse: () => Effect.die(new Error("test deadlocked")),
		}),
	);

describe("phase advance on awaitAdvance", () => {
	it("single party steps one phase per advance", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				yield* Phaser.run(
					phaser,
					Effect.gen(function* () {
						yield* Phaser.one(anim(log, "a"));
						yield* Phaser.one(anim(log, "b"));
					}),
				);
				yield* phaser.awaitAdvance;
				expect(log).toEqual(["a"]);
				yield* phaser.awaitAdvance;
				expect(log).toEqual(["a", "b"]);
			}),
		));

	it("empty phase resolves immediately", () =>
		runTest(
			Effect.gen(function* () {
				const phaser = yield* Phaser.Phaser.make;
				yield* phaser.awaitAdvance;
				yield* phaser.awaitAdvance;
				expect(phaser.snapshotUnsafe().parties).toBe(0);
			}),
		));

	it("resolves immediately after the scene finished", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				const fiber = yield* Phaser.run(phaser, Phaser.one(anim(log, "only")));
				yield* phaser.awaitAdvance;
				yield* phaser.awaitAdvance; // one() resumes, scene completes
				yield* Fiber.await(fiber);
				yield* phaser.awaitAdvance; // parties === 0: empty phase
				expect(log).toEqual(["only"]);
			}),
		));
});

describe("generations", () => {
	it("each advance is exactly one phase, never more", () =>
		runTest(
			Effect.gen(function* () {
				const phaser = yield* Phaser.Phaser.make;
				const steps = 5;
				yield* Phaser.run(
					phaser,
					Effect.gen(function* () {
						// re-arrives as fast as possible after every resume
						for (let i = 0; i < steps; i++) {
							yield* phaser.arriveAndAwaitAdvance;
						}
					}),
				);
				for (let i = 0; i < steps; i++) {
					const before = phaser.snapshotUnsafe().phase;
					yield* phaser.awaitAdvance;
					const after = phaser.snapshotUnsafe().phase;
					// a generation bleed would advance more than one phase
					expect(after - before).toBeLessThanOrEqual(1);
				}
				// the 5th arrival is still awaiting: one more advance releases
				// it, the loop exits, and the root deregisters
				yield* phaser.awaitAdvance;
				expect(phaser.snapshotUnsafe().parties).toBe(0);
			}),
		));
});

describe("root registration", () => {
	it("awaitAdvance before the scene fiber runs waits for the first arrival", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				yield* Phaser.run(
					phaser,
					Effect.gen(function* () {
						yield* Phaser.one(anim(log, "a"));
						yield* Phaser.one(anim(log, "b"));
					}),
				);
				// no startup latch: registration happened synchronously in run
				expect(phaser.snapshotUnsafe().parties).toBe(1);
				yield* phaser.awaitAdvance;
				// exactly the first phase ran — not zero, not two
				expect(log).toEqual(["a"]);
			}),
		));

	it("scene interrupt releases the root slot and unblocks awaitAdvance", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				const fiber = yield* Phaser.run(
					phaser,
					Effect.gen(function* () {
						yield* Phaser.one(anim(log, "a"));
						yield* Phaser.one(anim(log, "b"));
						yield* Phaser.one(anim(log, "never"));
					}),
				);
				yield* phaser.awaitAdvance;
				yield* Fiber.interrupt(fiber);
				expect(phaser.snapshotUnsafe().parties).toBe(0);
				yield* phaser.awaitAdvance; // must not hang
				expect(log).toEqual(["a"]);
			}),
		));
});

describe("sequential composition via one", () => {
	it("two one calls take two phases in order", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				yield* Phaser.run(
					phaser,
					Effect.gen(function* () {
						yield* Phaser.one(anim(log, "first"));
						yield* Phaser.one(anim(log, "second"));
					}),
				);
				yield* phaser.awaitAdvance;
				expect(log).toEqual(["first"]);
				yield* phaser.awaitAdvance;
				expect(log).toEqual(["first", "second"]);
			}),
		));
});

describe("parallel composition via all", () => {
	it("branches share one phase", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				yield* Phaser.run(
					phaser,
					Phaser.all([
						Phaser.one(anim(log, "a")),
						Phaser.one(anim(log, "b")),
						Phaser.one(anim(log, "c")),
					]),
				);
				yield* phaser.awaitAdvance;
				expect(log.sort()).toEqual(["a", "b", "c"]);
			}),
		));

	it("branches of different lengths do not deadlock", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				const fiber = yield* Phaser.run(
					phaser,
					Phaser.all([
						Phaser.one(anim(log, "short")),
						Effect.gen(function* () {
							yield* Phaser.one(anim(log, "long 1"));
							yield* Phaser.one(anim(log, "long 2"));
							yield* Phaser.one(anim(log, "long 3"));
						}),
					]),
				);
				yield* phaser.awaitAdvance;
				expect(log).toContain("short");
				expect(log).toContain("long 1");
				yield* phaser.awaitAdvance;
				expect(log).toContain("long 2");
				yield* phaser.awaitAdvance;
				expect(log).toContain("long 3");
				yield* phaser.awaitAdvance;
				yield* Fiber.await(fiber);
				expect(phaser.snapshotUnsafe().parties).toBe(0);
			}),
		));

	it("branch failure releases slots and does not hang awaitAdvance", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				const fiber = yield* Phaser.run(
					phaser,
					Phaser.all([
						Effect.gen(function* () {
							yield* Phaser.one(anim(log, "doomed"));
							yield* Effect.fail("boom" as const);
						}),
						Effect.gen(function* () {
							yield* Phaser.one(anim(log, "sibling 1"));
							yield* Phaser.one(anim(log, "sibling 2"));
						}),
					]),
				);
				yield* phaser.awaitAdvance;
				yield* phaser.awaitAdvance; // failure propagates, siblings interrupted
				const exit = yield* Fiber.await(fiber);
				expect(Exit.isFailure(exit)).toBe(true);
				expect(phaser.snapshotUnsafe().parties).toBe(0);
				yield* phaser.awaitAdvance; // must not hang
			}),
		));
});

describe("nested composition", () => {
	it("all nested inside one, with the trailing arrival phase", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				const fiber = yield* Phaser.run(
					phaser,
					Effect.gen(function* () {
						yield* Phaser.one(
							Phaser.all([
								Phaser.one(anim(log, "x")),
								Phaser.one(anim(log, "y")),
							]),
						);
						yield* Phaser.one(anim(log, "after"));
					}),
				);
				yield* phaser.awaitAdvance;
				expect(log.sort()).toEqual(["x", "y"]);
				// design D7: one(all(...)) arrives once more after the inner
				// all completes — its own (empty) phase boundary
				yield* phaser.awaitAdvance;
				expect(log).toHaveLength(2);
				yield* phaser.awaitAdvance;
				expect(log).toContain("after");
				yield* phaser.awaitAdvance;
				yield* Fiber.await(fiber);
			}),
		));

	it("all nested inside all", () =>
		runTest(
			Effect.gen(function* () {
				const log: string[] = [];
				const phaser = yield* Phaser.Phaser.make;
				const fiber = yield* Phaser.run(
					phaser,
					Phaser.all([
						Phaser.one(anim(log, "outer")),
						Phaser.all([
							Phaser.one(anim(log, "inner 1")),
							Phaser.one(anim(log, "inner 2")),
						]),
					]),
				);
				yield* phaser.awaitAdvance;
				expect(log.sort()).toEqual(["inner 1", "inner 2", "outer"]);
				yield* phaser.awaitAdvance;
				yield* phaser.awaitAdvance;
				yield* Fiber.await(fiber);
				expect(phaser.snapshotUnsafe().parties).toBe(0);
			}),
		));
});

describe("interruption-safe accounting", () => {
	it("an awaiting party interrupted mid-phase does not strand the waiter", () =>
		runTest(
			Effect.gen(function* () {
				const phaser = yield* Phaser.Phaser.make;
				phaser.register(2);
				// party A arrives and awaits
				const partyA = yield* Effect.forkChild(
					phaser.arriveAndAwaitAdvance.pipe(
						Effect.ensuring(Effect.sync(() => phaser.deregister(1))),
					),
				);
				yield* Effect.yieldNow;
				expect(phaser.snapshotUnsafe().arrived).toBe(1);
				// controller starts waiting while party B is still "running"
				const waiter = yield* Effect.forkChild(phaser.awaitAdvance);
				yield* Effect.yieldNow;
				// interrupt the awaiting party: arrival undone + slot released
				yield* Fiber.interrupt(partyA);
				expect(phaser.snapshotUnsafe().parties).toBe(1);
				// party B finally arrives: quiescence of the remaining parties
				const partyB = yield* Effect.forkChild(
					phaser.arriveAndAwaitAdvance.pipe(
						Effect.ensuring(Effect.sync(() => phaser.deregister(1))),
					),
				);
				yield* Fiber.await(waiter); // must resolve
				yield* Fiber.interrupt(partyB);
			}),
		));
});
