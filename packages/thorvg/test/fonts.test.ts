import { Effect, type Scope } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Canvas from "../src/Canvas";
import type { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import * as Font from "../src/Font";
import * as Paint from "../src/Paint";
import * as Text from "../src/Text";
import { unreachable } from "./raise";

/**
 * The scoped font registry (design D4 / thorvg-fonts spec): refcounted per
 * (module, family), unload at zero, loud conflicts, soft load failures.
 */

const run = <A, E>(effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw", {}))),
	);

// one real TTF fetched once for the whole file (network)
let fontBytes: Uint8Array;
const realFetch = globalThis.fetch;

beforeAll(async () => {
	const r = await realFetch(Font.DEFAULT_FONT_URL);
	fontBytes = new Uint8Array(await r.arrayBuffer());
}, 30000);

afterAll(() => {
	globalThis.fetch = realFetch;
});

/** Draw "Hello" in `family`; count bright pixels (0 = family has no glyphs). */
const paintTextAndCount = (family: string) =>
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
			if ((fb[i] ?? unreachable()) > 40) n++;
		}
		return n;
	});

describe("font registry", () => {
	it("dedup: two holders of the same family+url cause one fetch", async () => {
		let fetches = 0;
		globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
			fetches++;
			return realFetch(input, init);
		}) as typeof fetch;
		try {
			const bothHeld = await run(
				Effect.gen(function* () {
					const a = yield* Font.scoped("reg-dedup", {
						url: Font.DEFAULT_FONT_URL,
					});
					const b = yield* Font.scoped("reg-dedup", {
						url: Font.DEFAULT_FONT_URL,
					});
					return a && b;
				}),
			);
			expect(bothHeld).toBe(true);
			expect(fetches).toBe(1);
		} finally {
			globalThis.fetch = realFetch;
		}
	}, 30000);

	it("at zero: hold is forgotten, tombstone keeps re-acquires cheap and conflicts blocked", async () => {
		// the engine cannot unload data-loaded fonts (rc 5 NotSupported —
		// probed), so the registry tombstones the family at count 0: same-source
		// re-acquires succeed without re-upload; different sources still conflict
		const { whileHeld, reacquired, conflict } = await run(
			Effect.gen(function* () {
				const whileHeld = yield* Effect.scoped(
					Effect.gen(function* () {
						yield* Font.scoped("reg-zero", { bytes: fontBytes });
						return yield* paintTextAndCount("reg-zero");
					}),
				);
				// count hit 0; same source re-acquires against the tombstone
				const reacquired = yield* Effect.scoped(
					Effect.gen(function* () {
						const held = yield* Font.scoped("reg-zero", { bytes: fontBytes });
						const painted = yield* paintTextAndCount("reg-zero");
						return held && painted > 500;
					}),
				);
				// a different source is still a conflict — the old bytes still win
				const conflict = yield* Effect.result(
					Effect.scoped(
						Font.scoped("reg-zero", { url: "https://example.com/other.ttf" }),
					),
				);
				return { whileHeld, reacquired, conflict };
			}),
		);
		expect(whileHeld).toBeGreaterThan(500);
		expect(reacquired).toBe(true);
		expect(conflict._tag).toBe("Failure");
	}, 30000);

	it("an earlier release keeps the font loaded for remaining holders", async () => {
		const painted = await run(
			Effect.gen(function* () {
				// outer holder
				yield* Font.scoped("reg-shared", { bytes: fontBytes });
				// inner holder acquires and releases
				yield* Effect.scoped(Font.scoped("reg-shared", { bytes: fontBytes }));
				// outer still holds: glyphs must render
				return yield* paintTextAndCount("reg-shared");
			}),
		);
		expect(painted).toBeGreaterThan(500);
	}, 30000);

	it("conflicting sources for one family fail loudly, naming both", async () => {
		const result = await run(
			Effect.gen(function* () {
				yield* Font.scoped("reg-conflict", { bytes: fontBytes });
				return yield* Effect.result(
					Font.scoped("reg-conflict", { url: "https://example.com/other.ttf" }),
				);
			}),
		);
		expect(result._tag).toBe("Failure");
		if (result._tag === "Failure") {
			expect(result.failure._tag).toBe("ThorvgException");
			expect(String(result.failure.cause)).toContain("reg-conflict");
			expect(String(result.failure.cause)).toContain("example.com/other.ttf");
		}
	}, 30000);

	it("sniffFormat: OTTO magic is otf, TrueType is ttf", () => {
		expect(Font.sniffFormat(new Uint8Array([0x4f, 0x54, 0x54, 0x4f]))).toBe(
			"otf",
		);
		expect(Font.sniffFormat(fontBytes)).toBe("ttf");
	});

	it("a 404 source is a logged skip, not a failure", async () => {
		globalThis.fetch = (() =>
			Promise.resolve(new Response("nope", { status: 404 }))) as typeof fetch;
		try {
			const held = await run(
				Font.scoped("reg-404", { url: "https://example.com/missing.ttf" }),
			);
			expect(held).toBe(false);
		} finally {
			globalThis.fetch = realFetch;
		}
	}, 30000);

	it("invalid font bytes are a logged skip, not a failure", async () => {
		const held = await run(
			Font.scoped("reg-invalid", { bytes: new Uint8Array([1, 2, 3, 4, 5]) }),
		);
		expect(held).toBe(false);
	}, 30000);
});
