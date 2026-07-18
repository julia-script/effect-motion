import { Effect } from "effect";
import { ThorvgWasm } from "./Engine.js";
import {
	acquirePaint,
	checked,
	freePaint,
	type OwnedPaint,
	type Scratch,
	withScratch,
	wrap,
} from "./Interop.js";
import type { ThorvgException } from "./ThorvgException.js";

/** Operations common to every paint (shape, scene, text, picture) — design D2/D4. */

export const translate = (paint: OwnedPaint, x: number, y: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_paint_translate", () =>
				module._tvg_paint_translate(paint.ptr, x, y),
			),
		),
	);
export const rotate = (paint: OwnedPaint, angle: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_paint_rotate", () =>
				module._tvg_paint_rotate(paint.ptr, angle),
			),
		),
	);
export const scale = (paint: OwnedPaint, factor: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_paint_scale", () =>
				module._tvg_paint_scale(paint.ptr, factor),
			),
		),
	);
export const setOpacity = (paint: OwnedPaint, opacity: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_paint_set_opacity", () =>
				module._tvg_paint_set_opacity(paint.ptr, opacity),
			),
		),
	);

/**
 * Set a paint's full 2D affine transform. The 2×3 affine `(a b c d e f)` is
 * packed into ThorVG's row-major 3×3 `Tvg_Matrix` (9 floats) in scratch and
 * handed to `_tvg_paint_set_transform`:
 *
 *   e11=a  e12=c  e13=e
 *   e21=b  e22=d  e23=f
 *   e31=0  e32=0  e33=1
 *
 * Overwrites any prior translate/rotate/scale on the paint — apply this as the
 * single, final transform, never mixed with the scalar ops (design D3/D5).
 */
export const setTransform = (
	paint: OwnedPaint,
	m: { a: number; b: number; c: number; d: number; e: number; f: number },
) =>
	withScratch(36)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) => {
				s.writeF32(0, m.a);
				s.writeF32(4, m.c);
				s.writeF32(8, m.e);
				s.writeF32(12, m.b);
				s.writeF32(16, m.d);
				s.writeF32(20, m.f);
				s.writeF32(24, 0);
				s.writeF32(28, 0);
				s.writeF32(32, 1);
				return checked("_tvg_paint_set_transform", () =>
					module._tvg_paint_set_transform(paint.ptr, s.ptr),
				);
			}),
		),
	);

/** Duplicate a paint. The copy is detached, so the Scope owns its free (design D2). */
export const duplicate = (paint: OwnedPaint) =>
	acquirePaint(
		"_tvg_paint_duplicate",
		(m) => m._tvg_paint_duplicate(paint.ptr),
		freePaint,
	);

/** Axis-aligned bounding box: [x, y, w, h], read from malloc'd scratch (design D4). */
export const getAabb = (
	paint: OwnedPaint,
): Effect.Effect<
	{ x: number; y: number; w: number; h: number },
	ThorvgException,
	ThorvgWasm
> =>
	withScratch(16)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) =>
				checked("_tvg_paint_get_aabb", () =>
					module._tvg_paint_get_aabb(
						paint.ptr,
						s.ptr,
						s.ptr + 4,
						s.ptr + 8,
						s.ptr + 12,
					),
				),
			),
			Effect.as({
				x: s.readF32(0),
				y: s.readF32(4),
				w: s.readF32(8),
				h: s.readF32(12),
			}),
		),
	);

export const setVisible = (paint: OwnedPaint, visible: boolean) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_paint_set_visible", () =>
				module._tvg_paint_set_visible(paint.ptr, visible ? 1 : 0),
			),
		),
	);

/** Current opacity (0–255). */
export const getOpacity = (paint: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			wrap(() => module._tvg_paint_get_opacity(paint.ptr)),
		),
	);
