import type { PaintProjection } from "../Renderer";
import type { SvgNode } from "./SvgNode";

// style props a tilted polygon inherits from the shape it replaces
const STYLE_PROPS = ["fill", "stroke", "stroke-width", "opacity"] as const;

/**
 * A tilted plane as an exact `<polygon>`: its four projected screen corners,
 * carrying the shape's fill/stroke/opacity. Perspective-correct in both sinks
 * because the corners were projected individually (a receding plane is a
 * trapezoid, not a parallelogram).
 */
const tiltedPolygon = (
	node: SvgNode,
	quad: NonNullable<PaintProjection["quad"]>,
): SvgNode => {
	const props: Record<string, string | number> = {
		points: quad.map((p) => `${p.x},${p.y}`).join(" "),
	};
	for (const key of STYLE_PROPS) {
		if (key in node.props) {
			props[key] = node.props[key] as string | number;
		}
	}
	return { tag: "polygon", props };
};

/**
 * Wrap a paintable's rendered node in the camera projection for this frame.
 *
 * A tilted plane (projection carries a `quad`) becomes an exact `<polygon>`
 * of its four projected corners. Otherwise a billboard gets a single affine
 * `<g matrix>` mapping the shape's geometry to its projected screen position
 * and scale. A shape behind the camera (scale 0) is culled (returns `null`).
 */
export const wrapProjected = (
	node: SvgNode,
	projection: PaintProjection,
): SvgNode | null => {
	if (projection.scale <= 0) {
		return null; // behind the camera — nothing to paint
	}
	if (projection.quad !== undefined) {
		return tiltedPolygon(node, projection.quad);
	}
	const { a, b, c, d, e, f } = projection.screen;
	// identity placement (resting camera, z=0 content) adds no wrapper, so a
	// plain-2D scene renders byte-identical to before the camera existed
	if (a === 1 && b === 0 && c === 0 && d === 1 && e === 0 && f === 0) {
		return node;
	}
	return {
		tag: "g",
		props: { transform: `matrix(${a} ${b} ${c} ${d} ${e} ${f})` },
		children: [node],
	};
};
