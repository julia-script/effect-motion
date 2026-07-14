import * as Effect from "effect/Effect";
import type * as Renderer from "../Renderer";
import type { SvgNode } from "../svg/SvgNode";
import { renderOpacity, renderSize } from "./overLife";
import type { OverLife, Particle } from "./Particle";
import type { ParticleField } from "./ParticleField";

/**
 * Render a ParticleField: one <g> whose children are one <circle> per LIVE
 * particle, each sized/faded by the over-life curves. Dead slots emit
 * nothing. This is where the O(1)-simulation buffer expands back into N
 * SVG nodes.
 * ponytail: N SVG nodes is the RENDERING ceiling (the DOM/string cost), not
 * the simulation ceiling. A batched/instanced sink is the upgrade path if
 * node count becomes the wall.
 */
export const particleField: Renderer.RenderFunction<
	SvgNode,
	typeof ParticleField
> = ({ data }) =>
	Effect.succeed({
		tag: "g",
		props:
			data.x !== 0 || data.y !== 0
				? { transform: `translate(${data.x} ${data.y})` }
				: {},
		children: (data.buffer as ReadonlyArray<Particle>)
			.filter((p) => p.alive)
			.map((p): SvgNode => {
				const r = renderSize(p, data.sizeOverLife as OverLife | undefined);
				const opacity = renderOpacity(
					p,
					data.opacityOverLife as OverLife | undefined,
				);
				return {
					tag: "circle",
					props: {
						cx: p.x,
						cy: p.y,
						r,
						fill: p.color,
						...(opacity !== 1 ? { opacity } : {}),
					},
				};
			}),
	});
