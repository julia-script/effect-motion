import * as Effect from "effect/Effect";
import { EffectMotionError } from "./EffectMotionError";
import type * as Renderer from "./Renderer";

const resolveCanvas = Effect.fnUntraced(function* (
	target: HTMLCanvasElement | "string",
) {
	if (typeof target === "string") {
		if (typeof document === "undefined") {
			return yield* Effect.fail(
				EffectMotionError.of(
					"'document' is not available in the current environment",
				),
			);
		}
		const maybeCanvas = document.querySelector(target);

		if (maybeCanvas === null) {
			return yield* Effect.fail(
				EffectMotionError.of(`Could not find canvas with selector '${target}'`),
			);
		}
		if (!(maybeCanvas instanceof HTMLCanvasElement)) {
			return yield* Effect.fail(
				EffectMotionError.of(`Could not find canvas with selector '${target}'`),
			);
		}
		return maybeCanvas;
	}
	if (!(target instanceof HTMLCanvasElement)) {
		return yield* Effect.fail(
			EffectMotionError.of(`'target' is not a HTMLCanvasElement`),
		);
	}
	return target;
});
/**
 * Blit a framebuffer onto a DOM canvas. The canvas buffer takes the
 * framebuffer's PHYSICAL size (logical × dpr); CSS display size is left to
 * the caller — the intrinsic aspect ratio is preserved by the attributes, so
 * responsive styling (`width: 100%`) or a fixed `fb.logicalWidth`px both
 * work. Writing CSS here would clobber caller styling (e.g. React inline
 * styles are not re-applied on rerender).
 */
export const toCanvas = Effect.fnUntraced(function* (
	fb: Renderer.Framebuffer,
	target: HTMLCanvasElement | "string",
) {
	const canvas = yield* resolveCanvas(target);
	canvas.width = fb.width;
	canvas.height = fb.height;
	const ctx = canvas.getContext("2d");
	if (ctx === null) {
		return yield* Effect.fail(
			EffectMotionError.of("Could not get a 2D context from the canvas"),
		);
	}
	const clamped = Uint8ClampedArray.from(fb.rgba);
	ctx.putImageData(new ImageData(clamped, fb.width, fb.height), 0, 0);
});
