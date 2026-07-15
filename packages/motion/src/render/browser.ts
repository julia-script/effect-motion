import type * as Tvg from "@effect-motion/thorvg";
import type { ThorvgException } from "@effect-motion/thorvg";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type * as Entity from "../Entity";
import type * as Renderer from "../Renderer";
import type { Frame } from "../Scene";
import { type Framebuffer, renderFramebuffer } from "./core";

/**
 * Blit an RGBA framebuffer onto a target `HTMLCanvasElement`. The canvas is
 * sized to the framebuffer, then the pixels are written with `putImageData`
 * (straight RGBA8888, no premultiply — pinned by the thorvg smoke test).
 */
export const blitToCanvas = (
	fb: Framebuffer,
	target: HTMLCanvasElement,
): void => {
	if (target.width !== fb.width) {
		target.width = fb.width;
	}
	if (target.height !== fb.height) {
		target.height = fb.height;
	}
	const ctx = target.getContext("2d");
	if (ctx === null) {
		throw new Error("blitToCanvas: could not get a 2D context from the target");
	}
	// ImageData needs a Uint8ClampedArray; copy the bytes (fb.rgba is already a
	// fresh Uint8Array over a plain ArrayBuffer, so this is one contiguous copy)
	const clamped = Uint8ClampedArray.from(fb.rgba);
	ctx.putImageData(new ImageData(clamped, fb.width, fb.height), 0, 0);
};

/**
 * Browser output adapter: render a frame and blit it onto `target`. Same paint
 * path as the Node adapter — only the final read differs (this blits; the Node
 * adapter returns/encodes the buffer).
 */
export const renderToCanvas = <const Entities extends Entity.AnyEntity>(
	frame: Frame<Entities>,
	paints: Renderer.PaintFunctions<Entities>,
	target: HTMLCanvasElement,
): Effect.Effect<void, ThorvgException, Tvg.ThorvgWasm | Scope.Scope> =>
	renderFramebuffer(frame, paints).pipe(
		Effect.map((fb) => blitToCanvas(fb, target)),
	);
