import { Session } from "@effect-motion/thorvg";
import { EngineNode } from "@effect-motion/thorvg/node";
import { Effect, Layer } from "effect";
import type * as Entity from "../../src/Entity";
import * as Renderer from "../../src/Renderer";
import type { Frame } from "../../src/Scene";
import { unreachable } from "./raise";

/** extra session inputs a test can provide (e.g. images for Shapes.Image) */
export interface RenderOptions {
	readonly images?: Record<string, string>;
}

// engine + a per-render session (canvas sized by the render path)
const testLayer = (frame: Frame, options?: RenderOptions) =>
	Layer.provideMerge(
		Session.layer({
			width: frame.width,
			height: frame.height,
			...(options?.images !== undefined ? { images: options.images } : {}),
		}),
		EngineNode.layer("sw"),
	);

/**
 * Render a frame through the single ThorVG renderer and return a pixel-query
 * helper. Placement/composition tests assert that a shape lands where the
 * projection puts it by reading the framebuffer pixel there — a stronger check
 * than the old SVG-string matching.
 */
export interface Rendered {
	readonly width: number;
	readonly height: number;
	/** RGBA bytes at (x, y); [0,0,0,0] outside bounds. */
	readonly at: (x: number, y: number) => [number, number, number, number];
	/** true if the pixel at (x, y) differs from the frame's background. */
	readonly isPainted: (x: number, y: number) => boolean;
}

export const render = <const Entities extends Entity.AnyEntity>(
	frame: Frame<Entities>,
	options?: RenderOptions,
): Promise<Rendered> =>
	Effect.runPromise(
		Renderer.render(frame as Frame).pipe(
			Effect.scoped,
			Effect.provide(testLayer(frame as Frame, options)),
			Effect.orDie,
		),
	).then(({ rgba, width, height }) => {
		const at = (x: number, y: number): [number, number, number, number] => {
			if (x < 0 || y < 0 || x >= width || y >= height) {
				return [0, 0, 0, 0];
			}
			const o = (Math.round(y) * width + Math.round(x)) * 4;
			return [
				rgba[o] ?? unreachable(),
				rgba[o + 1] ?? unreachable(),
				rgba[o + 2] ?? unreachable(),
				rgba[o + 3] ?? unreachable(),
			];
		};
		// background is pixel (0,0) — the corner is never covered by a
		// centered shape in these tests
		const bg = at(0, 0);
		const isPainted = (x: number, y: number): boolean => {
			const [r, g, b] = at(x, y);
			return r !== bg[0] || g !== bg[1] || b !== bg[2];
		};
		return { width, height, at, isPainted };
	});

/**
 * Run a frame render for its Exit only — used by the defect tests, which
 * assert the render dies with a specific message (unknown id, duplicate
 * reference / cycle). The paint path never runs for those frames.
 */
export const renderExit = <const Entities extends Entity.AnyEntity>(
	frame: Frame<Entities>,
) =>
	Effect.runPromiseExit(
		Renderer.render(frame as Frame).pipe(
			Effect.scoped,
			Effect.provide(testLayer(frame as Frame)),
		),
	);
