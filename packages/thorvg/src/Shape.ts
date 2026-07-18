import { Effect } from "effect";
import { ThorvgWasm } from "./Engine.js";
import {
	acquirePaint,
	checked,
	freePaint,
	type OwnedPaint,
} from "./Interop.js";

export const make = () =>
	acquirePaint("_tvg_shape_new", (m) => m._tvg_shape_new(), freePaint);

export const appendRect = (
	shape: OwnedPaint,
	x: number,
	y: number,
	w: number,
	h: number,
	rx = 0,
	ry = 0,
	clockwise = true,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_append_rect", () =>
				module._tvg_shape_append_rect(
					shape.ptr,
					x,
					y,
					w,
					h,
					rx,
					ry,
					clockwise ? 1 : 0,
				),
			),
		),
	);

export const appendCircle = (
	shape: OwnedPaint,
	cx: number,
	cy: number,
	rx: number,
	ry: number,
	clockwise = true,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_append_circle", () =>
				module._tvg_shape_append_circle(
					shape.ptr,
					cx,
					cy,
					rx,
					ry,
					clockwise ? 1 : 0,
				),
			),
		),
	);

export const moveTo = (shape: OwnedPaint, x: number, y: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_move_to", () =>
				module._tvg_shape_move_to(shape.ptr, x, y),
			),
		),
	);
export const lineTo = (shape: OwnedPaint, x: number, y: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_line_to", () =>
				module._tvg_shape_line_to(shape.ptr, x, y),
			),
		),
	);
export const cubicTo = (
	shape: OwnedPaint,
	cx1: number,
	cy1: number,
	cx2: number,
	cy2: number,
	x: number,
	y: number,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_cubic_to", () =>
				module._tvg_shape_cubic_to(shape.ptr, cx1, cy1, cx2, cy2, x, y),
			),
		),
	);
export const close = (shape: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_close", () => module._tvg_shape_close(shape.ptr)),
		),
	);
export const reset = (shape: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_reset", () => module._tvg_shape_reset(shape.ptr)),
		),
	);

export const setFillColor = (
	shape: OwnedPaint,
	r: number,
	g: number,
	b: number,
	a = 255,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_set_fill_color", () =>
				module._tvg_shape_set_fill_color(shape.ptr, r, g, b, a),
			),
		),
	);
export const setStrokeColor = (
	shape: OwnedPaint,
	r: number,
	g: number,
	b: number,
	a = 255,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_set_stroke_color", () =>
				module._tvg_shape_set_stroke_color(shape.ptr, r, g, b, a),
			),
		),
	);
export const setStrokeWidth = (shape: OwnedPaint, width: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_shape_set_stroke_width", () =>
				module._tvg_shape_set_stroke_width(shape.ptr, width),
			),
		),
	);
