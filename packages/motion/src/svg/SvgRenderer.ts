import * as Effect from "effect/Effect";
import * as Renderer from "../Renderer";
import { SVG_NS, type SvgNode, vnodeToString } from "./SvgNode";

export interface SvgConfig {
	readonly width: number;
	readonly height: number;
}

/** Folds a frame into a single self-contained SVG document string. */
export const SvgRenderer = Renderer.make<SvgNode, SvgConfig>()("SvgRenderer", {
	render: (entities, config) =>
		Effect.gen(function* () {
			let svg = `<svg xmlns="${SVG_NS}" width="${config.width}" height="${config.height}">`;
			for (const { render } of entities) {
				svg += vnodeToString(yield* render);
			}
			return `${svg}</svg>`;
		}),
});
