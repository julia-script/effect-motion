import { Effect, Ref, type Scope } from "effect";
import { ThorvgWasm } from "./Engine.js";
import { checked, type OwnedPaint, Ptr, wrap } from "./Interop.js";
import type { ThorvgException } from "./ThorvgException.js";
import type { TvgCanvasInstance } from "./thorvgemscripten.js";

// The canvas is the Embind TvgCanvas (design finding): it exposes render()/the
// SW framebuffer and a .ptr() that the raw _tvg_canvas_* functions accept.

export interface Canvas {
	readonly instance: TvgCanvasInstance;
	readonly ptr: Ptr;
}

export const make = (
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

export const resize = (canvas: Canvas, width: number, height: number) =>
	wrap(() => canvas.instance.resize(width, height));
export const clear = (canvas: Canvas) => wrap(() => canvas.instance.clear());
export const render = (canvas: Canvas) => wrap(() => canvas.instance.render());
export const update = (canvas: Canvas) =>
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

/** Add a paint to the canvas. Transfers ownership: the canvas frees it now (design D2). */
export const add = (canvas: Canvas, child: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_canvas_add", () =>
				module._tvg_canvas_add(canvas.ptr, child.ptr),
			),
		),
		Effect.andThen(Ref.set(child.owned, false)),
	);
