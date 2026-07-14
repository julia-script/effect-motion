import type { FrameMeta } from "../Renderer";
import type { SvgNode } from "./SvgNode";

/**
 * The camera as an SVG transform for one top-level layer, scaled by that
 * layer's `depth` (pan AND zoom together). `depth` lerps the layer's
 * transform from identity toward the full camera:
 *
 *   depth 1 → full camera            depth 0 → identity (screen-fixed HUD)
 *   depth d → 1 + (zoom-1)*d zoom, d*pan translation
 *
 * Zoom is about the viewport center so it reads as "zoom into the middle of
 * the shot", not the world origin. Returns "" when the layer transform is
 * identity, so identity cameras add no attribute (output byte-identical to
 * before the camera existed).
 */
export const layerTransform = (
	camera: FrameMeta["camera"],
	depth: number,
	width: number,
	height: number,
): string => {
	const layerZoom = 1 + (camera.zoom - 1) * depth;
	const panX = camera.x * depth;
	const panY = camera.y * depth;
	if (layerZoom === 1 && panX === 0 && panY === 0) {
		return "";
	}
	const cx = width / 2;
	const cy = height / 2;
	// pan first, then zoom about the viewport center: reads right-to-left as
	// translate(-pan) → recenter → scale → uncenter applied to the layer
	const parts: string[] = [];
	if (layerZoom !== 1) {
		parts.push(
			`translate(${cx} ${cy})`,
			`scale(${layerZoom})`,
			`translate(${-cx} ${-cy})`,
		);
	}
	if (panX !== 0 || panY !== 0) {
		parts.push(`translate(${-panX} ${-panY})`);
	}
	return parts.join(" ");
};

/** `depth` for a top-level layer's data (a Layer carries it; others = 1). */
export const depthOf = (data: unknown): number => {
	const depth = (data as { depth?: unknown } | null)?.depth;
	return typeof depth === "number" ? depth : 1;
};

/** Wrap a rendered layer node in a camera `<g>`, or return it unwrapped
 * when the transform is identity (keeps the common case flat). */
export const wrapLayer = (node: SvgNode, transform: string): SvgNode =>
	transform === ""
		? node
		: { tag: "g", props: { transform }, children: [node] };
