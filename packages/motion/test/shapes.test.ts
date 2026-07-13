// @vitest-environment happy-dom
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

describe("visible defaults", () => {
	it("default circle: fill black, opacity 1, no stroke", () => {
		const data = Shapes.Circle.data.make({});
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			fill: "black",
			opacity: 1,
			radius: 10,
		});
		expect("stroke" in data).toBe(false);
		expect("strokeWidth" in data).toBe(false);
	});

	it("path: d required, fill black, translate only when offset", () => {
		const data = Shapes.Path.data.make({ d: "M 0 0 L 10 10 Z" });
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			d: "M 0 0 L 10 10 Z",
			fill: "black",
			opacity: 1,
		});
		expect("stroke" in data).toBe(false);
	});

	it("default line: stroke black, strokeWidth 1, no fill", () => {
		const data = Shapes.Line.data.make({ x2: 50, y2: 20 });
		expect(data).toMatchObject({
			x: 0,
			y: 0,
			x2: 50,
			y2: 20,
			stroke: "black",
			strokeWidth: 1,
			opacity: 1,
		});
		expect("fill" in data).toBe(false);
	});
});

type Builtin =
	| typeof Shapes.Circle
	| typeof Shapes.Rect
	| typeof Shapes.Square
	| typeof Shapes.Ellipse
	| typeof Shapes.Line
	| typeof Shapes.Path
	| typeof Shapes.Group;

const bodies: Scene.Frame<Builtin>["instances"] = {
	c: {
		data: Shapes.Circle.data.make({ x: 10, y: 20 }),
		entity: Shapes.Circle,
	},
	r: { data: Shapes.Rect.data.make({}), entity: Shapes.Rect },
	s: { data: Shapes.Square.data.make({ size: 40 }), entity: Shapes.Square },
	e: { data: Shapes.Ellipse.data.make({}), entity: Shapes.Ellipse },
	l: {
		data: Shapes.Line.data.make({ x2: 50, y2: 20 }),
		entity: Shapes.Line,
	},
	p: {
		data: Shapes.Path.data.make({ d: "M 0 0 L 10 10 Z", x: 5, y: 7 }),
		entity: Shapes.Path,
	},
};

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
};

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

describe("svg manifest covers every built-in through both sinks", () => {
	it("string sink renders all built-ins with correct tags and attrs", async () => {
		const svg = await Effect.runPromise(
			Effect.gen(function* () {
				const renderer = yield* Svg.SvgRenderer.Context;
				return yield* renderer.render(allShapesFrame, {
					width: 500,
					height: 300,
				});
			}).pipe(Effect.provide(layers)),
		);

		expect(svg).toContain('<circle cx="10" cy="20" r="10" fill="black" />');
		expect(svg).toContain(
			'<rect x="0" y="0" width="100" height="100" fill="black" />',
		);
		expect(svg).toContain(
			'<rect x="0" y="0" width="40" height="40" fill="black" />',
		);
		expect(svg).toContain(
			'<ellipse cx="0" cy="0" rx="20" ry="10" fill="black" />',
		);
		// line: visibly stroked by default, no fill attribute
		expect(svg).toContain(
			'<line x1="0" y1="0" x2="50" y2="20" stroke="black" stroke-width="1" />',
		);
		// path: offset becomes a translate; d passes through
		expect(svg).toContain(
			'<path d="M 0 0 L 10 10 Z" transform="translate(5 7)" fill="black" />',
		);
		// absent stroke is omitted, not emitted with a placeholder
		expect(svg).not.toContain('stroke="none"');
		expect(svg).not.toContain("undefined");
	});

	it("DOM sink renders all built-ins", async () => {
		const target = document.createElement("div");
		await Effect.runPromise(
			Effect.gen(function* () {
				const renderer = yield* Svg.SvgDomRenderer.Context;
				yield* renderer.render(allShapesFrame, {
					target,
					width: 500,
					height: 300,
				});
			}).pipe(Effect.provide(layers)),
		);

		expect(target.querySelectorAll("circle")).toHaveLength(1);
		expect(target.querySelectorAll("rect")).toHaveLength(2); // Rect + Square
		expect(target.querySelectorAll("ellipse")).toHaveLength(1);
		expect(target.querySelectorAll("line")).toHaveLength(1);
		expect(target.querySelectorAll("path")).toHaveLength(1);
		expect(target.querySelector("circle")?.getAttribute("fill")).toBe("black");
		expect(target.querySelector("circle")?.hasAttribute("stroke")).toBe(false);
		expect(target.querySelector("line")?.getAttribute("stroke")).toBe("black");
	});
});
