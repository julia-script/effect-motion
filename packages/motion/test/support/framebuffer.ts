import { Session } from "@effect-motion/thorvg";
import { EngineNode } from "@effect-motion/thorvg/node";
import { Effect, Layer } from "effect";
import * as Renderer from "../../src/Renderer";
import type { Frame } from "../../src/Scene";
import { unreachable } from "./raise";

/**
 * Loader layers for the frame's resources (Font.layer / Image.layer merges).
 * The `any` outputs let tests merge arbitrary loader unions; the engine and
 * session are provided by the harness beneath them.
 */
export interface RenderOptions {
	readonly resources?: Layer.Layer<any, any, never>;
}

// engine + a per-render session (canvas sized by the render path)
const testLayer = (frame: Frame<unknown>) =>
	Layer.provideMerge(
		Session.layer({ width: frame.width, height: frame.height }),
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

const provided = (
	frame: Frame<unknown>,
	options?: RenderOptions,
): Effect.Effect<Renderer.Framebuffer, unknown, never> => {
	const base = Renderer.render(frame as Frame<never>).pipe(Effect.scoped);
	const withResources =
		options?.resources !== undefined
			? base.pipe(Effect.provide(options.resources))
			: base;
	return withResources.pipe(Effect.provide(testLayer(frame))) as Effect.Effect<
		Renderer.Framebuffer,
		unknown,
		never
	>;
};

export const render = (
	frame: Frame<unknown>,
	options?: RenderOptions,
): Promise<Rendered> =>
	Effect.runPromise(provided(frame, options).pipe(Effect.orDie)).then(
		({ rgba, width, height }) => {
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
		},
	);

/**
 * Run a frame render for its Exit only — used by the defect tests, which
 * assert the render dies with a specific message (unknown id, duplicate
 * reference / cycle, missing resource loader).
 */
export const renderExit = (frame: Frame<unknown>, options?: RenderOptions) =>
	Effect.runPromiseExit(
		provided(frame, options) as Effect.Effect<
			Renderer.Framebuffer,
			unknown,
			never
		>,
	);
