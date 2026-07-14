import * as Effect from "effect/Effect";
import * as Renderer from "../Renderer";
import { depthOf, layerTransform, wrapLayer } from "./camera";
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
			// each top-level layer gets the camera scaled by its own depth
			for (const { render, entry } of entities) {
				const transform = layerTransform(
					meta.camera,
					depthOf(entry.data),
					width,
					height,
				);
				svg += vnodeToString(wrapLayer(yield* render, transform));
			}
			return `${svg}</svg>`;
		}),
});
