import { Context, Effect, Layer, type Scope } from "effect";
import * as Canvas from "./Canvas";
import type { ThorvgWasm } from "./Engine";
import * as Font from "./Font";
import type { ThorvgException } from "./ThorvgException";

/**
 * The session tier (design D3): everything a consumer holds for the lifetime
 * of "a scene being shown" — a player mount, an export run. Opening a session
 * acquires a canvas at the requested size and holds the requested fonts
 * (refcounted, per the Font registry); closing the scope releases both. The
 * engine's keeper canvas (design D1) makes deleting session canvases safe:
 * the font table survives them.
 */

export interface RenderSessionShape {
	readonly canvas: Canvas.Canvas;
}

export class RenderSession extends Context.Service<
	RenderSession,
	RenderSessionShape
>()("thorvg/RenderSession") {}

export interface SessionOptions {
	/** initial canvas size; the render path resizes in place when needed */
	readonly width: number;
	readonly height: number;
	/**
	 * fonts this session's scene needs, `family -> url` (e.g.
	 * `Fonts.urlMap(scene)` from effect-motion). Held for the session:
	 * loaded on open (deduped with other holders), released on close.
	 * Individual load failures are logged skips; conflicting sources for an
	 * already-held family fail loudly.
	 */
	readonly fonts?: Record<string, string>;
}

export const make = (
	options: SessionOptions,
): Effect.Effect<
	RenderSessionShape,
	ThorvgException,
	ThorvgWasm | Scope.Scope
> =>
	Effect.gen(function* () {
		const canvas = yield* Canvas.make(options.width, options.height);
		if (options.fonts !== undefined) {
			yield* Font.scopedMany(options.fonts);
		}
		return RenderSession.of({ canvas });
	});

export const layer = (options: SessionOptions) =>
	Layer.effect(RenderSession, make(options));

/**
 * The session canvas, resized in place to `width`×`height` if it isn't that
 * size already (TvgCanvas.resize self-dedupes on equal size) and cleared of
 * the previous frame's paints. The per-frame render path starts here.
 */
export const canvasSized = (
	width: number,
	height: number,
): Effect.Effect<Canvas.Canvas, ThorvgException, RenderSession> =>
	Effect.gen(function* () {
		const { canvas } = yield* RenderSession;
		yield* Canvas.resize(canvas, width, height);
		yield* Canvas.clear(canvas);
		return canvas;
	});
