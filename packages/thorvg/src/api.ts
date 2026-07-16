import { Effect, Ref, type Scope } from "effect";
import type { ThorvgException } from "./ThorvgException";
import {
	acquirePaint,
	checked,
	freePaint,
	type OwnedPaint,
	Ptr,
	type Scratch,
	ThorvgWasm,
	withScratch,
	wrap,
} from "./ThorvgWasm";
import type { TvgCanvasInstance } from "./thorvgemscripten";

// ─── Canvas ───────────────────────────────────────────────────────────────
// The canvas is the Embind TvgCanvas (design finding): it exposes render()/the
// SW framebuffer and a .ptr() that the raw _tvg_canvas_* functions accept.

export interface Canvas {
	readonly instance: TvgCanvasInstance;
	readonly ptr: Ptr;
}

export const makeCanvas = (
	width: number,
	height: number,
): Effect.Effect<Canvas, ThorvgException, ThorvgWasm | Scope.Scope> =>
	Effect.gen(function* () {
		const { module, renderer } = yield* ThorvgWasm;
		const instance = yield* Effect.acquireRelease(
			wrap(() => new module.TvgCanvas(renderer, "", width, height)),
			(c) => wrap(() => c.delete()).pipe(Effect.ignore),
		);
		return { instance, ptr: Ptr(instance.ptr()) };
	});

// ponytail: `TvgCanvas.delete()` (Embind) wipes the engine's FONT TABLE, not
// just the canvas (verified) — so a per-frame create+delete canvas breaks text
// on every frame after the first. The frame renderer must instead reuse ONE
// canvas across frames and `clear()` it (clear preserves fonts). We cache a
// canvas per (module, width, height) on the module so it lives for the engine's
// lifetime; it is never delete()d. If sizes vary a lot this leaks a canvas per
// size — acceptable (a handful); revisit if a use case churns sizes.
interface CanvasCacheHost {
	__emCanvasCache?: Map<string, Canvas>;
}

/**
 * A canvas reused across frames (never deleted, so fonts survive), keyed by
 * size. Clears it before returning so the previous frame's paints are gone.
 * Use this — not {@link makeCanvas} — for the per-frame render path.
 */
export const getSharedCanvas = (
	width: number,
	height: number,
): Effect.Effect<Canvas, ThorvgException, ThorvgWasm> =>
	Effect.gen(function* () {
		const { module, renderer } = yield* ThorvgWasm;
		const host = module as unknown as CanvasCacheHost;
		if (host.__emCanvasCache === undefined) {
			host.__emCanvasCache = new Map();
		}
		const key = `${width}x${height}`;
		let canvas = host.__emCanvasCache.get(key);
		if (canvas === undefined) {
			const instance = yield* wrap(
				() => new module.TvgCanvas(renderer, "", width, height),
			);
			canvas = { instance, ptr: Ptr(instance.ptr()) };
			host.__emCanvasCache.set(key, canvas);
		} else {
			// drop the previous frame's paints (clear preserves the font table)
			yield* wrap(() => canvas?.instance.clear());
		}
		return canvas;
	});

export const resize = (canvas: Canvas, width: number, height: number) =>
	wrap(() => canvas.instance.resize(width, height));
export const clear = (canvas: Canvas) => wrap(() => canvas.instance.clear());
export const render = (canvas: Canvas) => wrap(() => canvas.instance.render());
export const canvasUpdate = (canvas: Canvas) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_canvas_update", () =>
				module._tvg_canvas_update(canvas.ptr),
			),
		),
	);
export const draw = (canvas: Canvas, preserve = false) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_canvas_draw", () =>
				module._tvg_canvas_draw(canvas.ptr, preserve ? 1 : 0),
			),
		),
	);
export const sync = (canvas: Canvas) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_canvas_sync", () => module._tvg_canvas_sync(canvas.ptr)),
		),
	);

// ─── add: the ONLY ownership-transferring attach path (design D2) ───────────

/** Add a paint to the canvas. Transfers ownership: the canvas frees it now. */
export const addToCanvas = (canvas: Canvas, child: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_canvas_add", () =>
				module._tvg_canvas_add(canvas.ptr, child.ptr),
			),
		),
		Effect.andThen(Ref.set(child.owned, false)),
	);

/** Add a paint to a scene. Transfers ownership: the scene frees it now. */
export const addToScene = (scene: OwnedPaint, child: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_scene_add", () =>
				module._tvg_scene_add(scene.ptr, child.ptr),
			),
		),
		Effect.andThen(Ref.set(child.owned, false)),
	);

// ─── Shape ──────────────────────────────────────────────────────────────────

export const makeShape = () =>
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

// ─── Scene ────────────────────────────────────────────────────────────────

export const makeScene = () =>
	acquirePaint("_tvg_scene_new", (m) => m._tvg_scene_new(), freePaint);

// ─── Paint common (design D2/D4) ────────────────────────────────────────────

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

// ─── Scene effects ───────────────────────────────────────────────────────────

export const clearEffects = (scene: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_scene_clear_effects", () =>
				module._tvg_scene_clear_effects(scene.ptr),
			),
		),
	);

export const addGaussianBlur = (
	scene: OwnedPaint,
	sigma: number,
	direction: number,
	border: number,
	quality: number,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_scene_add_effect_gaussian_blur", () =>
				module._tvg_scene_add_effect_gaussian_blur(
					scene.ptr,
					sigma,
					direction,
					border,
					quality,
				),
			),
		),
	);

export const addDropShadow = (
	scene: OwnedPaint,
	r: number,
	g: number,
	b: number,
	a: number,
	angle: number,
	distance: number,
	sigma: number,
	quality: number,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_scene_add_effect_drop_shadow", () =>
				module._tvg_scene_add_effect_drop_shadow(
					scene.ptr,
					r,
					g,
					b,
					a,
					angle,
					distance,
					sigma,
					quality,
				),
			),
		),
	);

// ─── Picture / Text / Font / Animation / Gradient constructors ──────────────
// Constructors go through acquirePaint (paints) or acquireRelease with the
// type's own destructor (animation/gradient). Getters use withScratch (design
// D2/D4). Mutators follow the same `checked` pattern as shapes above.

export const makePicture = () =>
	acquirePaint("_tvg_picture_new", (m) => m._tvg_picture_new(), freePaint);

export const makeText = () =>
	acquirePaint("_tvg_text_new", (m) => m._tvg_text_new(), freePaint);

// ─── Text mutators + font loading (design D1/D4) ────────────────────────────
// Strings (text content, font names, mimetype) are marshalled to NUL-terminated
// UTF-8 in scratch. ThorVG copies what it needs during the call, so the scratch
// can free on scope close.

const utf8 = new TextEncoder();

/** Encode a string to NUL-terminated UTF-8 bytes (for scratch marshalling). */
const cstr = (s: string): Uint8Array => utf8.encode(`${s}\0`);

/** Run a text mutator that takes a single marshalled-string pointer. */
const withCstr = (
	operation: string,
	str: string,
	call: (m: import("./thorvgemscripten").ThorVGModule, ptr: Ptr) => number,
) =>
	withScratch(cstr(str).length)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) => {
				s.writeBytes(cstr(str));
				return checked(operation, () => call(module, s.ptr));
			}),
		),
	);

export const setText = (text: OwnedPaint, content: string) =>
	withCstr("_tvg_text_set_text", content, (m, ptr) =>
		m._tvg_text_set_text(text.ptr, ptr),
	);

export const setFont = (text: OwnedPaint, family: string) =>
	withCstr("_tvg_text_set_font", family, (m, ptr) =>
		m._tvg_text_set_font(text.ptr, ptr),
	);

export const setTextSize = (text: OwnedPaint, size: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_text_set_size", () =>
				module._tvg_text_set_size(text.ptr, size),
			),
		),
	);

export const setTextColor = (
	text: OwnedPaint,
	r: number,
	g: number,
	b: number,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_text_set_color", () =>
				module._tvg_text_set_color(text.ptr, r, g, b),
			),
		),
	);

/**
 * Text alignment as normalized anchors (0 = left/top, 0.5 = center, 1 =
 * right/bottom). ponytail: in the current binding this call succeeds but does
 * not visibly reposition a translated single-line text (design D4) — passed
 * through for forward-compat; precise alignment needs a measure pass.
 */
export const alignText = (text: OwnedPaint, halign: number, valign: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_text_align", () =>
				module._tvg_text_align(text.ptr, halign, valign),
			),
		),
	);

/**
 * Load a font into the engine from bytes, under `name`. Text paints reference
 * it via {@link setFont}. `mimetype` is the format tag ThorVG expects — "ttf"
 * for TrueType (the only format supported here). `copy = 1`, so ThorVG owns its
 * copy and the scratch frees on scope close. Fonts are engine-global (not
 * paints): loaded once, live for the engine's lifetime.
 */
export const loadFontData = (
	name: string,
	bytes: Uint8Array,
	mimetype = "ttf",
) => {
	const nameB = cstr(name);
	const mimeB = cstr(mimetype);
	// pack [name\0][mime\0][data] in one block; pass offset pointers
	return withScratch(nameB.length + mimeB.length + bytes.length)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) => {
				s.writeBytes(nameB, 0);
				s.writeBytes(mimeB, nameB.length);
				s.writeBytes(bytes, nameB.length + mimeB.length);
				return checked("_tvg_font_load_data", () =>
					module._tvg_font_load_data(
						s.ptr,
						s.ptr + nameB.length + mimeB.length,
						bytes.length,
						s.ptr + nameB.length,
						1,
					),
				);
			}),
		),
	);
};

/** Unload a named font from the engine. */
export const unloadFont = (name: string) =>
	withCstr("_tvg_font_unload", name, (m, ptr) => m._tvg_font_unload(ptr));

/** A gradient is a Fill, not a Paint — freed by `_tvg_gradient_del`, not unref. */
const acquireGradient = (
	operation: string,
	create: (m: import("./thorvgemscripten").ThorVGModule) => number,
) =>
	acquirePaint(operation, create, (m, ptr) => {
		m._tvg_gradient_del(ptr);
	});

export const makeLinearGradient = () =>
	acquireGradient("_tvg_linear_gradient_new", (m) =>
		m._tvg_linear_gradient_new(),
	);

export const makeRadialGradient = () =>
	acquireGradient("_tvg_radial_gradient_new", (m) =>
		m._tvg_radial_gradient_new(),
	);

/**
 * Pack an array of `[offset, r, g, b, a]` color stops into scratch and set them.
 * Each stop is a Tvg_Color_Stop: float offset + 4 bytes rgba, laid out as the
 * struct expects (8 bytes/stop: f32 offset + 4×u8) (design D4).
 */
export const setColorStops = (
	gradient: OwnedPaint,
	stops: ReadonlyArray<{
		offset: number;
		r: number;
		g: number;
		b: number;
		a: number;
	}>,
) =>
	withScratch(stops.length * 8)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) => {
				stops.forEach((stop, i) => {
					const base = i * 8;
					s.writeF32(base, stop.offset);
					s.writeBytes(
						new Uint8Array([stop.r, stop.g, stop.b, stop.a]),
						base + 4,
					);
				});
				return checked("_tvg_gradient_set_color_stops", () =>
					module._tvg_gradient_set_color_stops(
						gradient.ptr,
						s.ptr,
						stops.length,
					),
				);
			}),
		),
	);

/** An Animation is not a Paint — it owns its picture and is freed by `_tvg_animation_del`. */
export const makeAnimation = () =>
	acquirePaint(
		"_tvg_animation_new",
		(m) => m._tvg_animation_new(),
		(m, ptr) => {
			m._tvg_animation_del(ptr);
		},
	);
