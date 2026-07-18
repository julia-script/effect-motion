import { Context, Effect, Layer, type Scope } from "effect";
import * as Canvas from "./Canvas";
import type { ThorvgWasm } from "./Engine";
import * as Font from "./Font";
import type { OwnedPaint } from "./Interop";
import * as Picture from "./Picture";
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
	/**
	 * Decoded source pictures by declared name, loaded once at session open
	 * and freed by the session scope. The per-frame render path duplicates
	 * these (duplicates share the decoded surface — spike-verified) and hands
	 * the duplicates to the frame subtree. A name whose fetch/decode failed is
	 * simply absent.
	 */
	readonly pictures: ReadonlyMap<string, OwnedPaint>;
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
	/**
	 * images this session's scene needs, `name -> url` (e.g.
	 * `Images.urlMap(scene)` from effect-motion). Fetched and decoded once at
	 * open into session-owned pictures, freed on close. A failed fetch/decode
	 * is a logged skip naming the asset and source — the session still opens.
	 * Unlike fonts, pictures are not engine-global: sessions never interact.
	 */
	readonly images?: Record<string, string>;
}

// fetch one image's bytes and decode into a session-owned picture; any
// failure is a logged skip (design D4 — fonts semantics, verbatim)
const loadPicture = (
	name: string,
	url: string,
): Effect.Effect<OwnedPaint | undefined, never, ThorvgWasm | Scope.Scope> =>
	Effect.gen(function* () {
		const bytes = yield* Effect.promise(() =>
			fetch(url)
				.then((r) => {
					if (!r.ok) {
						throw new Error(`HTTP ${r.status}`);
					}
					return r.arrayBuffer();
				})
				.then((buf) => new Uint8Array(buf))
				.catch((err) => {
					console.warn(
						`@effect-motion/thorvg: image "${name}" failed to fetch from ${url}`,
						err,
					);
					return undefined;
				}),
		);
		if (bytes === undefined) {
			return undefined;
		}
		// a picture whose decode failed stays detached and is freed by the
		// session scope like any owned paint
		const made = yield* Effect.result(
			Effect.gen(function* () {
				const picture = yield* Picture.make();
				yield* Picture.load(picture, bytes);
				return picture;
			}),
		);
		if (made._tag === "Failure") {
			console.warn(
				`@effect-motion/thorvg: image "${name}" from ${url} failed to decode`,
				made.failure,
			);
			return undefined;
		}
		return made.success;
	});

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
		const pictures = new Map<string, OwnedPaint>();
		if (options.images !== undefined) {
			yield* Effect.forEach(
				Object.entries(options.images),
				([name, url]) =>
					loadPicture(name, url).pipe(
						Effect.map((picture) => {
							if (picture !== undefined) {
								pictures.set(name, picture);
							}
							return picture;
						}),
					),
				{ concurrency: "unbounded", discard: true },
			);
		}
		return RenderSession.of({ canvas, pictures });
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
