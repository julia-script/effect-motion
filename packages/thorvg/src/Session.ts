import { Context, Effect, Layer, Scope } from "effect";
import * as Canvas from "./Canvas.js";
import { ThorvgWasm } from "./Engine.js";
import type { OwnedPaint } from "./Interop.js";
import * as Picture from "./Picture.js";
import type { ThorvgException } from "./ThorvgException.js";

/**
 * The session tier (design D3): everything a consumer holds for the lifetime
 * of "a scene being shown" — a player mount, an export run. Opening a session
 * acquires a canvas at the requested size; closing the scope releases it and
 * every session-owned picture. Fonts are engine-global and are registered by
 * the render path through the scoped Font registry, not by the session.
 */

export interface RenderSessionShape {
	readonly canvas: Canvas.Canvas;
	/**
	 * Decoded source pictures by resource id, registered lazily by the render
	 * path (first frame that uses an image) and freed by the session scope.
	 * The per-frame render path duplicates these (duplicates share the
	 * decoded surface — spike-verified) and hands the duplicates to the frame
	 * subtree.
	 */
	readonly pictures: ReadonlyMap<string, OwnedPaint>;
	/**
	 * Decode encoded bytes (png/jpg/webp/svg) into a session-owned picture
	 * under `id`, or return the already-registered one — decode-once per
	 * session. The picture is bound to the SESSION scope (it outlives the
	 * per-frame render scope), so it is freed when the session closes.
	 */
	readonly registerPicture: (
		id: string,
		bytes: Uint8Array,
	) => Effect.Effect<OwnedPaint, ThorvgException>;
}

export class RenderSession extends Context.Service<
	RenderSession,
	RenderSessionShape
>()("thorvg/RenderSession") {}

export interface SessionOptions {
	/** initial canvas size; the render path resizes in place when needed */
	readonly width: number;
	readonly height: number;
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
		// captured so lazily-registered pictures attach their release to the
		// SESSION's lifetime, not the per-frame render scope calling in
		const sessionScope = yield* Effect.scope;
		const wasm = yield* ThorvgWasm;
		const pictures = new Map<string, OwnedPaint>();
		const registerPicture = (
			id: string,
			bytes: Uint8Array,
		): Effect.Effect<OwnedPaint, ThorvgException> =>
			Effect.gen(function* () {
				const existing = pictures.get(id);
				if (existing !== undefined) {
					return existing;
				}
				const picture = yield* Picture.make();
				yield* Picture.load(picture, bytes);
				pictures.set(id, picture);
				return picture;
			}).pipe(
				Scope.provide(sessionScope),
				Effect.provideService(ThorvgWasm, wasm),
			);
		return RenderSession.of({ canvas, pictures, registerPicture });
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
