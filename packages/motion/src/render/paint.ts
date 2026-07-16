import type { OwnedPaint, ThorvgException } from "@effect-motion/thorvg";
import * as Tvg from "@effect-motion/thorvg";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type { PaintProjection } from "../Renderer";
import { parseColor } from "./color";

/**
 * Shared paint helpers: style application, projection, and the attach step
 * every leaf paint function runs. Keeping the ThorVG call sequence in one
 * place means each shape's paint function is just "make geometry, then
 * `finishPaint`".
 */

/** The style fields a filled/stroked shape carries in its data. */
export interface StyleData {
	readonly fill?: string;
	readonly stroke?: string;
	readonly strokeWidth?: number;
	readonly opacity: number;
}

/** Apply fill/stroke/opacity from shape data onto a ThorVG shape paint. */
export const applyStyle = (
	shape: OwnedPaint,
	data: StyleData,
): Effect.Effect<void, ThorvgException, Tvg.ThorvgWasm> =>
	Effect.gen(function* () {
		if (data.fill !== undefined) {
			const { r, g, b, a } = parseColor(data.fill);
			yield* Tvg.setFillColor(shape, r, g, b, a);
		}
		if (data.stroke !== undefined) {
			const { r, g, b, a } = parseColor(data.stroke);
			yield* Tvg.setStrokeColor(shape, r, g, b, a);
		}
		if (data.strokeWidth !== undefined) {
			yield* Tvg.setStrokeWidth(shape, data.strokeWidth);
		}
		// opacity 1 is the ThorVG default; only set when it changes something
		if (data.opacity !== 1) {
			yield* Tvg.setOpacity(shape, Math.round(data.opacity * 255));
		}
	});

const isIdentity = (m: PaintProjection["screen"]): boolean =>
	m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;

/**
 * Apply the billboard projection affine to a shape, then add it to the scene.
 * The identity affine (resting camera, z=0) is skipped so plain-2D scenes
 * issue the minimal draw calls. Ownership transfers to the scene on add.
 *
 * Callers must NOT have applied any translate/rotate/scale to the shape —
 * `setTransform` is the single, final transform (design D3).
 */
export const finishPaint = (
	shape: OwnedPaint,
	scene: OwnedPaint,
	projection: PaintProjection,
): Effect.Effect<void, ThorvgException, Tvg.ThorvgWasm | Scope.Scope> =>
	Effect.gen(function* () {
		if (!isIdentity(projection.screen)) {
			yield* Tvg.setTransform(shape, projection.screen);
		}
		yield* Tvg.addToScene(scene, shape);
	});
