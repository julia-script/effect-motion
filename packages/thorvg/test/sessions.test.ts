import { Effect, type Scope } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Canvas from "../src/Canvas";
import type { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import * as Font from "../src/Font";
import * as Paint from "../src/Paint";
import * as Session from "../src/Session";
import * as Shape from "../src/Shape";
import * as Text from "../src/Text";

/** RenderSession (design D3): scoped canvas + scoped fonts per session. */

const run = <A, E>(effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw", {}))),
	);

let fontBytes: Uint8Array;
const realFetch = globalThis.fetch;
const FONT_URL = "https://fonts.test/session.ttf";

beforeAll(async () => {
	const r = await realFetch(Font.DEFAULT_FONT_URL);
	fontBytes = new Uint8Array(await r.arrayBuffer());
	// serve the session font URL from memory; everything else passes through
	globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
		if (String(input) === FONT_URL) {
			return Promise.resolve(new Response(fontBytes.slice(), { status: 200 }));
		}
		return realFetch(input, init);
	}) as typeof fetch;
}, 30000);

afterAll(() => {
	globalThis.fetch = realFetch;
});

/** paint a deterministic buffer (bg + rect) sized w×h on `canvas`. */
const drawRect = (canvas: Canvas.Canvas, w: number, h: number) =>
	Effect.gen(function* () {
		yield* Canvas.clear(canvas);
		const bg = yield* Shape.make();
		yield* Shape.appendRect(bg, 0, 0, w, h);
		yield* Shape.setFillColor(bg, 0, 0, 32);
		yield* Canvas.add(canvas, bg);
		const rect = yield* Shape.make();
		yield* Shape.appendRect(rect, 4, 4, w / 2, h / 2);
		yield* Shape.setFillColor(rect, 255, 80, 0);
		yield* Canvas.add(canvas, rect);
		yield* Canvas.update(canvas);
		yield* Canvas.draw(canvas);
		yield* Canvas.sync(canvas);
		return new Uint8Array(yield* Canvas.render(canvas));
	});

const paintText = (family: string) =>
	Effect.gen(function* () {
		const canvas = yield* Canvas.make(200, 80);
		const text = yield* Text.make();
		yield* Text.setFont(text, family);
		yield* Text.setText(text, "Hello");
		yield* Text.setSize(text, 40);
		yield* Text.setColor(text, 255, 255, 255);
		yield* Paint.translate(text, 10, 55);
		yield* Canvas.add(canvas, text);
		yield* Canvas.update(canvas);
		yield* Canvas.draw(canvas);
		yield* Canvas.sync(canvas);
		const fb = new Uint8Array(yield* Canvas.render(canvas));
		let n = 0;
		for (let i = 0; i < fb.length; i += 4) {
			if (fb[i]! > 40) n++;
		}
		return n;
	});

describe("render sessions", () => {
	it("the session canvas is deleted when the session closes", async () => {
		const canvas = await run(
			Effect.gen(function* () {
				const session = yield* Effect.scoped(
					Session.make({ width: 32, height: 32 }),
				);
				return session.canvas;
			}),
		);
		// Embind throws on any use of a deleted object
		expect(() => canvas.instance.size()).toThrow();
	}, 30000);

	it("canvasSized resizes in place and renders at the new size", async () => {
		const { first, second } = await run(
			Effect.gen(function* () {
				const session = yield* Session.make({ width: 40, height: 30 });
				const provided = <A, E, R>(
					e: Effect.Effect<A, E, R | Session.RenderSession>,
				) => Effect.provideService(e, Session.RenderSession, session);

				const c1 = yield* provided(Session.canvasSized(40, 30));
				const first = yield* drawRect(c1, 40, 30);
				const c2 = yield* provided(Session.canvasSized(80, 60));
				const second = yield* drawRect(c2, 80, 60);
				return { first, second };
			}),
		);
		expect(first.byteLength).toBe(40 * 30 * 4);
		expect(second.byteLength).toBe(80 * 60 * 4);
	}, 30000);

	it("two concurrent sessions render independently at different sizes", async () => {
		const { a, b, aAfterBClosed } = await run(
			Effect.gen(function* () {
				const sessionA = yield* Session.make({ width: 40, height: 30 });
				const { a, b } = yield* Effect.scoped(
					Effect.gen(function* () {
						const sessionB = yield* Session.make({ width: 100, height: 50 });
						const a = yield* drawRect(sessionA.canvas, 40, 30);
						const b = yield* drawRect(sessionB.canvas, 100, 50);
						return { a, b };
					}),
				);
				// closing B must not affect A
				const aAfterBClosed = yield* drawRect(sessionA.canvas, 40, 30);
				return { a, b, aAfterBClosed };
			}),
		);
		expect(a.byteLength).toBe(40 * 30 * 4);
		expect(b.byteLength).toBe(100 * 50 * 4);
		expect(Buffer.from(aAfterBClosed).equals(Buffer.from(a))).toBe(true);
	}, 30000);

	it("session fonts load on open, are shared, and release on close", async () => {
		const { during, conflictDuring, afterViaNewSession } = await run(
			Effect.gen(function* () {
				const { during, conflictDuring } = yield* Effect.scoped(
					Effect.gen(function* () {
						yield* Session.make({
							width: 8,
							height: 8,
							fonts: { "session-font": FONT_URL },
						});
						const during = yield* paintText("session-font");
						// a concurrent hold of the same family from another source
						// conflicts loudly
						const conflictDuring = yield* Effect.result(
							Effect.scoped(
								Font.scoped("session-font", {
									url: "https://fonts.test/other.ttf",
								}),
							),
						);
						return { during, conflictDuring };
					}),
				);
				// session closed -> hold released; a new session re-acquires the
				// same family+url cheaply (tombstone) and still renders
				const afterViaNewSession = yield* Effect.scoped(
					Effect.gen(function* () {
						yield* Session.make({
							width: 8,
							height: 8,
							fonts: { "session-font": FONT_URL },
						});
						return yield* paintText("session-font");
					}),
				);
				return { during, conflictDuring, afterViaNewSession };
			}),
		);
		expect(during).toBeGreaterThan(500);
		expect(conflictDuring._tag).toBe("Failure");
		expect(afterViaNewSession).toBeGreaterThan(500);
	}, 30000);
});
