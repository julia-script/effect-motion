import { Effect, type Scope } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import * as Paint from "../src/Paint";
import { encodePng } from "../src/png";
import * as Session from "../src/Session";

/** Session-owned pictures (image-assets D2 / thorvg-runtime session delta). */

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

// 4×4 red PNG — a distinct "other source" for the same-name test
const redPng = (() => {
	const rgba = new Uint8Array(4 * 4 * 4);
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i] = 255;
		rgba[i + 3] = 255;
	}
	return encodePng(rgba, 4, 4);
})();

const GREEN_URL = "https://images.test/green.png";
const RED_URL = "https://images.test/red.png";
const realFetch = globalThis.fetch;
let fetches: string[] = [];

beforeAll(() => {
	globalThis.fetch = ((input: RequestInfo | URL) => {
		const url = String(input);
		fetches.push(url);
		if (url === GREEN_URL) {
			return Promise.resolve(new Response(greenPng.slice(), { status: 200 }));
		}
		if (url === RED_URL) {
			return Promise.resolve(new Response(redPng.slice(), { status: 200 }));
		}
		return Promise.resolve(new Response("nope", { status: 404 }));
	}) as typeof fetch;
});

afterAll(() => {
	globalThis.fetch = realFetch;
});

describe("session images", () => {
	it("decodes each declared image once at open; frames reuse it", async () => {
		fetches = [];
		const { held, sizes } = await run(
			Effect.gen(function* () {
				const session = yield* Session.make({
					width: 16,
					height: 16,
					images: { logo: GREEN_URL },
				});
				const source = session.pictures.get("logo");
				if (source === undefined) {
					return { held: false, sizes: [] as number[] };
				}
				// "many frames": duplicate repeatedly, never re-fetch/decode
				const sizes: number[] = [];
				for (let i = 0; i < 5; i++) {
					yield* Effect.scoped(
						Effect.gen(function* () {
							const dup = yield* Paint.duplicate(source);
							// first aabb query on a fresh paint returns garbage
							// (same engine quirk the smoke test works around)
							yield* Paint.getAabb(dup);
							const aabb = yield* Paint.getAabb(dup);
							sizes.push(aabb.w);
						}),
					);
				}
				return { held: true, sizes };
			}),
		);
		expect(held).toBe(true);
		expect(sizes).toEqual([8, 8, 8, 8, 8]);
		expect(fetches.filter((u) => u === GREEN_URL)).toHaveLength(1);
	}, 30000);

	it("a 404 entry is a logged skip; the session opens and others load", async () => {
		const { opened, loaded, missing } = await run(
			Effect.gen(function* () {
				const session = yield* Session.make({
					width: 16,
					height: 16,
					images: {
						good: GREEN_URL,
						broken: "https://images.test/missing.png",
					},
				});
				return {
					opened: true,
					loaded: session.pictures.has("good"),
					missing: session.pictures.has("broken"),
				};
			}),
		);
		expect(opened).toBe(true);
		expect(loaded).toBe(true);
		expect(missing).toBe(false);
	}, 30000);

	it("undecodable bytes are a logged skip, not a failure", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(
				new Response(new Uint8Array([9, 9, 9, 9]), { status: 200 }),
			)) as typeof fetch;
		try {
			const has = await run(
				Effect.gen(function* () {
					const session = yield* Session.make({
						width: 16,
						height: 16,
						images: { junk: "https://images.test/junk.bin" },
					});
					return session.pictures.has("junk");
				}),
			);
			expect(has).toBe(false);
		} finally {
			globalThis.fetch = ((input: RequestInfo | URL) => {
				const url = String(input);
				fetches.push(url);
				if (url === GREEN_URL) {
					return Promise.resolve(
						new Response(greenPng.slice(), { status: 200 }),
					);
				}
				if (url === RED_URL) {
					return Promise.resolve(new Response(redPng.slice(), { status: 200 }));
				}
				return Promise.resolve(new Response("nope", { status: 404 }));
			}) as typeof fetch;
		}
	}, 30000);

	it("pictures are freed when the session closes", async () => {
		const probe = await run(
			Effect.gen(function* () {
				const source = yield* Effect.scoped(
					Effect.gen(function* () {
						const session = yield* Session.make({
							width: 16,
							height: 16,
							images: { logo: GREEN_URL },
						});
						return session.pictures.get("logo");
					}),
				);
				// session closed -> source freed. Duplicating a freed paint must
				// fail (checkedPtr/exception), never succeed silently.
				if (source === undefined) {
					return "missing";
				}
				const result = yield* Effect.result(
					Effect.scoped(Paint.duplicate(source)),
				);
				return result._tag;
			}),
		);
		expect(probe).toBe("Failure");
	}, 30000);

	it("two sessions with the same name from different sources don't interact", async () => {
		const { a, b } = await run(
			Effect.gen(function* () {
				const sessionA = yield* Session.make({
					width: 16,
					height: 16,
					images: { logo: GREEN_URL },
				});
				const sessionB = yield* Session.make({
					width: 16,
					height: 16,
					images: { logo: RED_URL },
				});
				// distinguish by natural size: green is 8×8, red is 4×4
				const sizeOf = (
					source: NonNullable<ReturnType<typeof sessionA.pictures.get>>,
				) =>
					Effect.scoped(
						Effect.gen(function* () {
							const dup = yield* Paint.duplicate(source);
							// prime: first aabb query on a fresh paint is garbage
							yield* Paint.getAabb(dup);
							return (yield* Paint.getAabb(dup)).w;
						}),
					);
				const a = yield* sizeOf(sessionA.pictures.get("logo")!);
				const b = yield* sizeOf(sessionB.pictures.get("logo")!);
				return { a, b };
			}),
		);
		expect(a).toBe(8);
		expect(b).toBe(4);
	}, 30000);
});
