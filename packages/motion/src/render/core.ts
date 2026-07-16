import type { ThorvgException } from "@effect-motion/thorvg";
import * as Tvg from "@effect-motion/thorvg";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type * as Entity from "../Entity";
import * as Renderer from "../Renderer";
import type { Frame } from "../Scene";
import { parseColor } from "./color";

/** RGBA8888 framebuffer plus its dimensions, straight from the SW canvas. */
export interface Framebuffer {
	readonly rgba: Uint8Array;
	readonly width: number;
	readonly height: number;
}

/**
 * Render one frame to an RGBA framebuffer, shared by both output adapters.
 *
 * Creates a canvas sized to the frame, clears it to the background color, adds
 * a root scene, folds the frame onto it via `Renderer.render`, then
 * update/draw/sync and reads the SW framebuffer. Everything is scoped: the
 * canvas, root scene, and every painted shape are freed when the scope closes
 * (ThorVG parent-owns-child — freeing the canvas frees the subtree).
 *
 * The background is painted as a filled rect (not a canvas clear color) so it
 * survives into the buffer the same way the SVG sink emitted a background
 * rect.
 */
export const renderFramebuffer = <const Entities extends Entity.AnyEntity>(
	frame: Frame<Entities>,
	paints: Renderer.PaintFunctions<Entities>,
): Effect.Effect<Framebuffer, ThorvgException, Tvg.ThorvgWasm | Scope.Scope> =>
	Effect.gen(function* () {
		const width = frame.width;
		const height = frame.height;
		// reuse a persistent canvas (cleared each frame) — a per-frame
		// create+delete would wipe the engine's font table via TvgCanvas.delete()
		// (see api.getSharedCanvas). The scene + shapes below are still scoped
		// per frame; clear() drops the prior frame's subtree from the canvas.
		const canvas = yield* Tvg.getSharedCanvas(width, height);
		const scene = yield* Tvg.makeScene();

		// background as a filled rect covering the viewport (mirrors the SVG
		// sink's background rect; survives into the raster buffer)
		const bg = yield* Tvg.makeShape();
		yield* Tvg.appendRect(bg, 0, 0, width, height);
		const { r, g, b, a } = parseColor(frame.backgroundColor);
		yield* Tvg.setFillColor(bg, r, g, b, a);
		yield* Tvg.addToScene(scene, bg);

		yield* Renderer.render(frame, canvas, scene, paints);

		yield* Tvg.addToCanvas(canvas, scene);
		yield* Tvg.canvasUpdate(canvas);
		yield* Tvg.draw(canvas);
		yield* Tvg.sync(canvas);

		const buffer = yield* Tvg.render(canvas);
		return { rgba: new Uint8Array(buffer), width, height };
	});
