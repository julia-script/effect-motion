import * as Effect from "effect/Effect";
import * as Renderer from "../Renderer";
import { wrapProjected } from "./project";
import { SVG_NS, type SvgNode, vnodeToString } from "./SvgNode";

export interface SvgConfig {
	/** viewport size — defaults to the frame's own width/height metadata */
	readonly width?: number;
	readonly height?: number;
}

/** Folds a frame into a single self-contained SVG document string. */
export const SvgRenderer = Renderer.make<SvgNode, SvgConfig>()("SvgRenderer", {
	render: (entities, config, meta) =>
		Effect.gen(function* () {
			const width = config.width ?? meta.width;
			const height = config.height ?? meta.height;
			let svg = `<svg xmlns="${SVG_NS}" width="${width}" height="${height}">`;
			// a rect, not a style attr — survives rasterizers that ignore CSS
			svg += `<rect width="100%" height="100%" fill="${meta.backgroundColor}"/>`;
			// entities arrive depth-sorted (far→near); wrap each in its camera
			// projection and paint in that order
			for (const { render, projection } of entities) {
				const wrapped = wrapProjected(yield* render, projection);
				if (wrapped !== null) {
					svg += vnodeToString(wrapped);
				}
			}
			return `${svg}</svg>`;
		}),
});
