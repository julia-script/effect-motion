import type { ThorvgException, ThorvgWasm } from "@effect-motion/thorvg";
import { encodePng } from "@effect-motion/thorvg/node";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type * as Entity from "../Entity";
import type * as Renderer from "../Renderer";
import type { Frame } from "../Scene";
import { type Framebuffer, renderFramebuffer } from "./core";

/**
 * Node output adapter: render a frame to a raw RGBA framebuffer. Same paint
 * path as the browser adapter — only the final read differs (this hands back
 * the buffer; the browser adapter blits it).
 */
export const renderToBuffer = <const Entities extends Entity.AnyEntity>(
	frame: Frame<Entities>,
	paints: Renderer.PaintFunctions<Entities>,
): Effect.Effect<Framebuffer, ThorvgException, ThorvgWasm | Scope.Scope> =>
	renderFramebuffer(frame, paints);

/**
 * Node output adapter: render a frame to a PNG buffer via the thorvg
 * package's `encodePng`. The framebuffer is straight RGBA8888 (pinned by the
 * thorvg smoke test), so no channel swizzle is needed.
 */
export const renderToPng = <const Entities extends Entity.AnyEntity>(
	frame: Frame<Entities>,
	paints: Renderer.PaintFunctions<Entities>,
): Effect.Effect<Uint8Array, ThorvgException, ThorvgWasm | Scope.Scope> =>
	renderFramebuffer(frame, paints).pipe(
		Effect.map(({ rgba, width, height }) => encodePng(rgba, width, height)),
	);
