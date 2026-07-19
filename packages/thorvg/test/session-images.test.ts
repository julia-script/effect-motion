import { Effect, type Scope } from "effect";
import { describe, expect, it } from "vitest";
import type { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import type { OwnedPaint } from "../src/Interop";
import * as Paint from "../src/Paint";
import { encodePng } from "../src/png";
import * as Session from "../src/Session";

/**
 * Session-owned pictures (image-assets delta): the render path registers
 * loader-provided bytes lazily via `registerPicture` — decode-once per
 * session, session-scoped ownership, sessions never interact. No URL
 * fetching exists in this path.
 */

const run = <A, E>(effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw", {}))),
	);

const greenPng = (() => {
	const rgba = new Uint8Array(8 * 8 * 4);
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i + 1] = 255;
		rgba[i + 3] = 255;
	}
	return encodePng(rgba, 8, 8);
})();

// 4×4 red PNG — a distinct source for the same-id-across-sessions test
const redPng = (() => {
	const rgba = new Uint8Array(4 * 4 * 4);
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i] = 255;
		rgba[i + 3] = 255;
	}
	return encodePng(rgba, 4, 4);
})();

describe("session images", () => {
	it("registerPicture decodes once; repeat registrations and frames reuse it", async () => {
		const { same, sizes } = await run(
			Effect.gen(function* () {
				const session = yield* Session.make({ width: 16, height: 16 });
				const first = yield* session.registerPicture("logo", greenPng);
				// decode-once: a second registration returns the same picture
				const second = yield* session.registerPicture("logo", greenPng.slice());
				// "many frames": duplicate repeatedly, never re-decode
				const sizes: number[] = [];
				for (let i = 0; i < 5; i++) {
					yield* Effect.scoped(
						Effect.gen(function* () {
							const dup = yield* Paint.duplicate(first);
							// first aabb query on a fresh paint returns garbage
							// (same engine quirk the smoke test works around)
							yield* Paint.getAabb(dup);
							const aabb = yield* Paint.getAabb(dup);
							sizes.push(aabb.w);
						}),
					);
				}
				return { same: first === second, sizes };
			}),
		);
		expect(same).toBe(true);
		expect(sizes).toEqual([8, 8, 8, 8, 8]);
	}, 30000);

	it("undecodable bytes fail loudly with a typed exception", async () => {
		const result = await run(
			Effect.gen(function* () {
				const session = yield* Session.make({ width: 16, height: 16 });
				const attempt = yield* Effect.result(
					session.registerPicture("junk", new Uint8Array([9, 9, 9, 9])),
				);
				return {
					tag: attempt._tag,
					cached: session.pictures.has("junk"),
				};
			}),
		);
		expect(result.tag).toBe("Failure");
		expect(result.cached).toBe(false);
	}, 30000);

	it("pictures are freed when the session closes", async () => {
		const probe = await run(
			Effect.gen(function* () {
				const source = yield* Effect.scoped(
					Effect.gen(function* () {
						const session = yield* Session.make({ width: 16, height: 16 });
						return yield* session.registerPicture("logo", greenPng);
					}),
				);
				// session closed -> source freed. Duplicating a freed paint must
				// fail (checkedPtr/exception), never succeed silently.
				const result = yield* Effect.result(
					Effect.scoped(Paint.duplicate(source)),
				);
				return result._tag;
			}),
		);
		expect(probe).toBe("Failure");
	}, 30000);

	it("two sessions with the same id from different bytes don't interact", async () => {
		const { a, b } = await run(
			Effect.gen(function* () {
				const sessionA = yield* Session.make({ width: 16, height: 16 });
				const sessionB = yield* Session.make({ width: 16, height: 16 });
				const pictureA = yield* sessionA.registerPicture("logo", greenPng);
				const pictureB = yield* sessionB.registerPicture("logo", redPng);
				// distinguish by natural size: green is 8×8, red is 4×4
				const sizeOf = (source: OwnedPaint) =>
					Effect.scoped(
						Effect.gen(function* () {
							const dup = yield* Paint.duplicate(source);
							// prime: first aabb query on a fresh paint is garbage
							yield* Paint.getAabb(dup);
							return (yield* Paint.getAabb(dup)).w;
						}),
					);
				const a = yield* sizeOf(pictureA);
				const b = yield* sizeOf(pictureB);
				return { a, b };
			}),
		);
		expect(a).toBe(8);
		expect(b).toBe(4);
	}, 30000);
});
