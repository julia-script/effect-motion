import { Context, Effect, Latch, Layer } from "effect";

/**
 * An externally paced phaser (cf. java.util.concurrent.Phaser).
 *
 * Unlike java's Phaser, which advances the moment the last party arrives,
 * this phaser HOLDS at quiescence until the controller calls `awaitAdvance`,
 * which arms the advance and resolves once every registered party has
 * arrived again. One call = one phase = one animation frame.
 */
export class Phaser extends Context.Service<Phaser>()("motion/Phaser", {
	make: Effect.sync(() => {
		let phase = 0;
		let parties = 0;
		let arrived = 0;
		let phaseLatch = Latch.makeUnsafe();
		let state: "idle" | "pending" | "running" = "idle";
		const waiters = new Set<() => void>();

		// The single invariant. Every event that touches `arrived` or
		// `parties` re-runs this.
		const checkQuiescence = (): void => {
			if (arrived !== parties) {
				return;
			}
			switch (state) {
				case "idle": {
					// all parties arrived, no waiter: hold until awaitAdvance
					return;
				}
				case "pending": {
					phase++;
					arrived = 0;
					const oldLatch = phaseLatch;
					// swap BEFORE open: a party that synchronously re-arrives
					// awaits the new latch and counts toward the new phase
					phaseLatch = Latch.makeUnsafe();
					state = "running";
					oldLatch.openUnsafe();
					// covers parties === 0 and synchronous re-arrivals
					checkQuiescence();
					return;
				}
				case "running": {
					state = "idle";
					const copy = new Set(waiters);
					waiters.clear();
					for (const waiter of copy) {
						waiter();
					}
					return;
				}
			}
		};

		const register = (n: number): void => {
			parties += n;
		};

		const deregister = (n: number): void => {
			parties -= n;
			checkQuiescence();
		};

		const arriveAndAwaitAdvance: Effect.Effect<void> =
			Effect.uninterruptibleMask((restore) =>
				Effect.suspend(() => {
					const myLatch = phaseLatch; // generation token
					arrived++;
					checkQuiescence();
					return restore(myLatch.await).pipe(
						Effect.onInterrupt(() =>
							Effect.sync(() => {
								// undo the phantom arrival, but only if our
								// generation is still the current one
								if (myLatch === phaseLatch) {
									arrived--;
									checkQuiescence();
								}
							}),
						),
					);
				}),
			);

		const awaitAdvance: Effect.Effect<number> = Effect.callback<number>(
			(resume) => {
				const waiter = () => resume(Effect.succeed(phase));
				waiters.add(waiter);
				if (waiters.size > 1) {
					return Effect.sync(() => {
						waiters.delete(waiter);
					});
				}
				if (arrived === parties) {
					// quiescent: arm an advance so parties run the next phase
					state = "pending";
					checkQuiescence();
				} else {
					// parties still running toward their next arrival (e.g.
					// scene startup): resolve at the first quiescence, do not
					// advance past it
					state = "running";
				}
				return Effect.sync(() => {
					// interrupted while suspended
					waiters.delete(waiter);
					state = "idle";
				});
			},
		);

		return {
			register,
			deregister,
			arriveAndAwaitAdvance,
			awaitAdvance,
			/** debug/test view of the internal counters */
			snapshotUnsafe: () => ({ phase, parties, arrived, state }),
		};
	}),
}) {}

/**
 * Fork `scene` as the root party of `phaser`.
 *
 * Registration happens synchronously before the fork, so between combinators
 * the scene is registered-but-running and `awaitAdvance` can never resolve
 * during a sequential handoff or before the scene starts. The slot is
 * released by a finalizer on success, failure, and interrupt alike.
 */
export const run = <A, E = never, R = never>(
	phaser: Phaser["Service"],
	scene: Effect.Effect<A, E, R>,
) =>
	Effect.uninterruptibleMask(() =>
		Effect.suspend(() => {
			phaser.register(1);
			return Effect.interruptible(scene).pipe(
				Effect.ensuring(Effect.sync(() => phaser.deregister(1))),
				Effect.provide(Layer.succeed(Phaser, phaser)),
				Effect.forkChild,
			);
		}),
	);

/**
 * Run `effect`, then arrive at the phase boundary.
 *
 * Borrows the caller's party slot (no register/deregister) — that is what
 * makes consecutive `one` calls handoff-gap-free.
 */
export const one = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
	Effect.gen(function* () {
		const phaser = yield* Phaser;
		const result = yield* effect;
		yield* phaser.arriveAndAwaitAdvance;
		return result;
	});

/**
 * Run branches in parallel, sharing phases.
 *
 * N branches share N slots: the caller's one (the caller is blocked, not
 * arrived, so it must not hold a countable slot) plus N-1 minted here. A
 * finished branch releases a slot immediately so it cannot hold the phase
 * open — except the last branch, whose slot returns to the resuming caller
 * with no deregister/register gap.
 */
export const all = <Eff extends Effect.Effect<any, any, any>>(
	effects: Iterable<Eff>,
): Effect.Effect<
	void,
	Eff extends Effect.Effect<any, infer E, any> ? E : never,
	(Eff extends Effect.Effect<any, any, infer R> ? R : never) | Phaser
> =>
	Effect.gen(function* () {
		const phaser = yield* Phaser;
		const list = Array.from(effects);
		const n = list.length;
		if (n === 0) {
			return;
		}
		if (n === 1) {
			// biome-ignore lint/style/noNonNullAssertion: n === 1 guarantees it
			yield* list[0]!;
			return;
		}
		let live = n;
		let held = n - 1; // extra slots this `all` still holds
		yield* Effect.uninterruptibleMask((restore) =>
			Effect.suspend(() => {
				phaser.register(held);
				const branches = list.map((branch) =>
					branch.pipe(
						Effect.andThen(
							Effect.sync(() => {
								live--;
								if (live > 0) {
									held--;
									phaser.deregister(1);
								}
							}),
						),
					),
				);
				return restore(Effect.all(branches, { concurrency: "unbounded" })).pipe(
					Effect.ensuring(
						Effect.sync(() => {
							// failure/interrupt: release whatever is still held
							if (held > 0) {
								const leftover = held;
								held = 0;
								phaser.deregister(leftover);
							}
						}),
					),
				);
			}),
		);
	});
