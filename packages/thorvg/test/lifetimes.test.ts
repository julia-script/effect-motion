import path from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, type Scope } from "effect";
import { describe, expect, it } from "vitest";
import * as Canvas from "../src/Canvas";
import * as Engine from "../src/Engine";
import { ThorvgWasm } from "../src/Engine";
import * as EngineNode from "../src/EngineNode";
import * as Font from "../src/Font";
import { wrapPromise } from "../src/Interop";
import * as Paint from "../src/Paint";
import * as Shape from "../src/Shape";
import * as Text from "../src/Text";

/**
 * Engine-tier lifetimes (design D1/D2). ThorVG's Initializer is refcounted
 * per TvgCanvas construct/destruct and the font table dies when it reaches
 * zero — so the engine acquire installs a keeper canvas that pins it, working
 * canvases delete freely, and the Node release (`termOnRelease`) deletes the
 * keeper and terminates, so nothing leaks across acquisitions.
 */

// no auto-fonts: each test loads exactly what it needs
const run = <A, E>(effect: Effect.Effect<A, E, ThorvgWasm | Scope.Scope>) =>
	Effect.runPromise(
		effect.pipe(Effect.scoped, Effect.provide(EngineNode.layer("sw", {}))),
	);

// raw options for tests that acquire the engine directly (no layer)
const wasmDir = path.resolve(
	fileURLToPath(import.meta.resolve("@thorvg/webcanvas")),
	"..",
);
const nodeOptions: Engine.ThorvgOptions = {
	renderer: "sw",
	locateFile: (file: string) => path.resolve(wasmDir, file),
	fonts: {},
	termOnRelease: true,
};

const fetchFontBytes = wrapPromise(() =>
	fetch(Font.DEFAULT_FONT_URL)
		.then((r) => {
			if (!r.ok) {
				throw new Error(`HTTP ${r.status}`);
			}
			return r.arrayBuffer();
		})
		.then((b) => new Uint8Array(b)),
);

/** Draw "Hello" in `family` on a fresh canvas; count bright pixels. */
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
			if (fb[i]! > 40) n++;
		}
		return n;
	});

describe("engine lifetimes (design D1/D2)", () => {
	it("keeper: fonts survive canvas churn with no help from the caller", async () => {
		const { paintedOnA, paintedOnB } = await run(
			Effect.gen(function* () {
				const bytes = yield* fetchFontBytes;
				yield* Font.loadData("lifetimes-churn", bytes);

				// canvas A lives in an inner scope: deleted before canvas B exists.
				// The engine's own keeper must keep the font table alive.
				const paintedOnA = yield* Effect.scoped(
					paintTextAndCount("lifetimes-churn"),
				);
				const paintedOnB = yield* Effect.scoped(
					paintTextAndCount("lifetimes-churn"),
				);
				return { paintedOnA, paintedOnB };
			}),
		);
		expect(paintedOnA).toBeGreaterThan(500);
		expect(paintedOnB).toBeGreaterThan(500);
	}, 30000);

	it("double-acquire shares one module; inner release does not term", async () => {
		const { sameModule, painted } = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const outer = yield* Engine.make(nodeOptions);
					const bytes = yield* fetchFontBytes;
					// inner acquire + release while the outer scope still holds
					const innerModule = yield* Effect.scoped(
						Effect.gen(function* () {
							const inner = yield* Engine.make(nodeOptions);
							return inner.module;
						}),
					);
					// outer must still be alive: load a font and render with it
					yield* Font.loadData("lifetimes-refcount", bytes).pipe(
						Effect.provideService(ThorvgWasm, outer),
					);
					const painted = yield* Effect.scoped(
						paintTextAndCount("lifetimes-refcount"),
					).pipe(Effect.provideService(ThorvgWasm, outer));
					return { sameModule: innerModule === outer.module, painted };
				}),
			),
		);
		expect(sameModule).toBe(true);
		// glyphs render after the inner release — the refcount kept the engine up
		expect(painted).toBeGreaterThan(500);
	}, 30000);

	it("termOnRelease: fonts do not leak into the next acquisition", async () => {
		const bytes = await Effect.runPromise(fetchFontBytes);
		const first = await run(
			Effect.gen(function* () {
				yield* Font.loadData("lifetimes-term", bytes);
				return yield* Effect.scoped(paintTextAndCount("lifetimes-term"));
			}),
		);
		expect(first).toBeGreaterThan(500);

		// new acquisition in the same process: the previous release deleted the
		// keeper and term()ed, so the font must be gone (set_font fails or the
		// canvas stays blank)
		const second = await run(
			Effect.result(Effect.scoped(paintTextAndCount("lifetimes-term"))),
		);
		if (second._tag === "Success") {
			expect(second.success).toBe(0);
		} else {
			expect(second.failure._tag).toBe("ThorvgException");
		}
	}, 30000);

	it("resize in place renders identically to a fresh canvas at the target size", async () => {
		const drawScene = (canvas: Canvas.Canvas) =>
			Effect.gen(function* () {
				// clear any prior subtree, then paint a fully deterministic buffer:
				// background rect + inset rect (malloc'd targets start uninitialized)
				yield* Canvas.clear(canvas);
				const bg = yield* Shape.make();
				yield* Shape.appendRect(bg, 0, 0, 60, 40);
				yield* Shape.setFillColor(bg, 0, 0, 32);
				yield* Canvas.add(canvas, bg);
				const rect = yield* Shape.make();
				yield* Shape.appendRect(rect, 12, 8, 30, 20, 4, 4);
				yield* Shape.setFillColor(rect, 255, 80, 0);
				yield* Canvas.add(canvas, rect);
				yield* Canvas.update(canvas);
				yield* Canvas.draw(canvas);
				yield* Canvas.sync(canvas);
				return new Uint8Array(yield* Canvas.render(canvas));
			});

		const { resized, fresh } = await run(
			Effect.gen(function* () {
				const a = yield* Canvas.make(100, 80);
				yield* Canvas.resize(a, 60, 40);
				const resized = yield* drawScene(a);

				const b = yield* Canvas.make(60, 40);
				const fresh = yield* drawScene(b);
				return { resized, fresh };
			}),
		);
		expect(resized.byteLength).toBe(60 * 40 * 4);
		expect(Buffer.from(resized).equals(Buffer.from(fresh))).toBe(true);
	}, 30000);
});
