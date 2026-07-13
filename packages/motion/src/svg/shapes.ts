import { Layer } from "effect";
import * as Effect from "effect/Effect";
import type * as Renderer from "../Renderer";
import * as Shapes from "../shapes";
import { entityRendererLayer } from "./layers";
import type { SvgNode } from "./SvgNode";

/**
 * SVG implementations of the built-in shape definitions — this file is
 * the SVG target's coverage manifest: a built-in not registered here is
 * a type error at the consumer's render call, not a runtime surprise.
 */

interface StyleData {
	readonly fill?: string;
	readonly stroke?: string;
	readonly strokeWidth?: number;
	readonly opacity: number;
}

// absent props are omitted, never emitted with placeholders; opacity 1
// (the SVG default) is omitted to keep output minimal
const styleAttrs = (data: StyleData): Record<string, string | number> => {
	const attrs: Record<string, string | number> = {};
	if (data.fill !== undefined) {
		attrs.fill = data.fill;
	}
	if (data.stroke !== undefined) {
		attrs.stroke = data.stroke;
	}
	if (data.strokeWidth !== undefined) {
		attrs["stroke-width"] = data.strokeWidth;
	}
	if (data.opacity !== 1) {
		attrs.opacity = data.opacity;
	}
	return attrs;
};

export const circle: Renderer.RenderFunction<SvgNode, typeof Shapes.Circle> = ({
	data,
}) =>
	Effect.succeed({
		tag: "circle",
		props: { cx: data.x, cy: data.y, r: data.radius, ...styleAttrs(data) },
	});

export const rect: Renderer.RenderFunction<SvgNode, typeof Shapes.Rect> = ({
	data,
}) =>
	Effect.succeed({
		tag: "rect",
		props: {
			x: data.x,
			y: data.y,
			width: data.width,
			height: data.height,
			...styleAttrs(data),
		},
	});

export const square: Renderer.RenderFunction<SvgNode, typeof Shapes.Square> = ({
	data,
}) =>
	Effect.succeed({
		tag: "rect",
		props: {
			x: data.x,
			y: data.y,
			width: data.size,
			height: data.size,
			...styleAttrs(data),
		},
	});

export const ellipse: Renderer.RenderFunction<
	SvgNode,
	typeof Shapes.Ellipse
> = ({ data }) =>
	Effect.succeed({
		tag: "ellipse",
		props: {
			cx: data.x,
			cy: data.y,
			rx: data.rx,
			ry: data.ry,
			...styleAttrs(data),
		},
	});

export const line: Renderer.RenderFunction<SvgNode, typeof Shapes.Line> = ({
	data,
}) =>
	Effect.succeed({
		tag: "line",
		props: {
			x1: data.x,
			y1: data.y,
			x2: data.x2,
			y2: data.y2,
			...styleAttrs(data),
		},
	});

export const path: Renderer.RenderFunction<SvgNode, typeof Shapes.Path> = ({
	data,
}) =>
	Effect.succeed({
		tag: "path",
		props: {
			d: data.d,
			// x/y offset the whole path; translate only when it does something
			...(data.x !== 0 || data.y !== 0
				? { transform: `translate(${data.x} ${data.y})` }
				: {}),
			...styleAttrs(data),
		},
	});

// a group paints nothing itself: one <g> positioning its rendered children
export const group: Renderer.RenderFunction<SvgNode, typeof Shapes.Group> = ({
	data,
	children,
}) =>
	Effect.succeed({
		tag: "g",
		props: {
			...(data.x !== 0 || data.y !== 0
				? { transform: `translate(${data.x} ${data.y})` }
				: {}),
			...styleAttrs(data),
		},
		children,
	});

/** Every built-in shape registered with both sinks. */
export const shapesLayer = Layer.mergeAll(
	entityRendererLayer(Shapes.Circle, circle),
	entityRendererLayer(Shapes.Rect, rect),
	entityRendererLayer(Shapes.Square, square),
	entityRendererLayer(Shapes.Ellipse, ellipse),
	entityRendererLayer(Shapes.Line, line),
	entityRendererLayer(Shapes.Path, path),
	entityRendererLayer(Shapes.Group, group),
);
