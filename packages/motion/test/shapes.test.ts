import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { render } from "./support/framebuffer";

describe("visible defaults", () => {
	it("default circle: fill white, opacity 1, no stroke", () => {
		const data = Shapes.Circle.data.make({});
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			fill: "white",
			opacity: 1,
			radius: 10,
		});
		expect("stroke" in data).toBe(false);
		expect("strokeWidth" in data).toBe(false);
	});

	it("path: d required, fill white, translate only when offset", () => {
		const data = Shapes.Path.data.make({ d: "M 0 0 L 10 10 Z" });
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			d: "M 0 0 L 10 10 Z",
			fill: "white",
			opacity: 1,
		});
		expect("stroke" in data).toBe(false);
	});

	it("default line: stroke white, strokeWidth 1, no fill", () => {
		const data = Shapes.Line.data.make({ x2: 50, y2: 20 });
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			x2: 50,
			y2: 20,
			stroke: "white",
			strokeWidth: 1,
			opacity: 1,
		});
		expect("fill" in data).toBe(false);
	});
});

// Path and Text are deferred (ThorVG needs an SVG-`d` parser / engine font
// loading — a separate change), so the manifest covers the geometric built-ins
// the single renderer paints today. Each is placed at a distinct, in-frame
// point so a pixel check confirms it painted.
type Builtin =
	| typeof Shapes.Circle
	| typeof Shapes.Rect
	| typeof Shapes.Square
	| typeof Shapes.Ellipse
	| typeof Shapes.Line
	| typeof Shapes.Group;

// each entry: a shape and a point where its fill/stroke should land
const cases = {
	c: {
		entity: Shapes.Circle,
		data: Shapes.Circle.data.make({ x: 60, y: 60, radius: 20 }),
		point: [60, 60] as const,
	},
	r: {
		entity: Shapes.Rect,
		data: Shapes.Rect.data.make({ x: 150, y: 40, width: 60, height: 60 }),
		point: [180, 70] as const,
	},
	s: {
		entity: Shapes.Square,
		data: Shapes.Square.data.make({ x: 300, y: 40, size: 60 }),
		point: [330, 70] as const,
	},
	e: {
		entity: Shapes.Ellipse,
		data: Shapes.Ellipse.data.make({ x: 100, y: 200, rx: 30, ry: 20 }),
		point: [100, 200] as const,
	},
	l: {
		entity: Shapes.Line,
		// a thick horizontal stroke so its center pixel is solidly painted
		data: Shapes.Line.data.make({
			x: 250,
			y: 220,
			x2: 350,
			y2: 220,
			strokeWidth: 8,
		}),
		point: [300, 220] as const,
	},
};

const bodies: Scene.Frame<Builtin>["instances"] = Object.fromEntries(
	Object.entries(cases).map(([id, c]) => [
		id,
		{ data: c.data, entity: c.entity },
	]),
) as Scene.Frame<Builtin>["instances"];

const allShapesFrame: Scene.Frame<Builtin> = {
	instances: {
		...bodies,
		root: {
			data: Shapes.Group.data.make({ children: Object.keys(bodies) }),
			entity: Shapes.Group,
		},
	},
	root: "root",
	frameRate: 60,
	width: 500,
	height: 300,
	backgroundColor: "#16161d",
	camera: Camera.identity(500),
};

describe("the renderer paints every geometric built-in", () => {
	it("each built-in lands paint at its projected position", async () => {
		const r = await render(allShapesFrame);
		// every case paints its point (default fill/stroke is white on the dark
		// background), covering the manifest for the shapes the renderer handles
		for (const [id, c] of Object.entries(cases)) {
			expect(r.isPainted(c.point[0], c.point[1]), `${id} should paint`).toBe(
				true,
			);
		}
		// a corner well away from every shape stays background
		expect(r.isPainted(2, 298)).toBe(false);
	});
});
