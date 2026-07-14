// @vitest-environment happy-dom
import { Effect, Layer, Schema } from "effect";
import { describe, expect, it } from "vitest";
import * as Entity from "../src/Entity";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

describe("vnodeToString", () => {
	it("renders a self-closing element with props", () => {
		expect(
			Svg.vnodeToString({ tag: "circle", props: { cx: 5, cy: 6, r: 10 } }),
		).toBe('<circle cx="5" cy="6" r="10" />');
	});

	it("renders nested children", () => {
		expect(
			Svg.vnodeToString({
				tag: "g",
				props: { transform: "translate(1,2)" },
				children: [{ tag: "rect", props: { width: 3 } }],
			}),
		).toBe('<g transform="translate(1,2)"><rect width="3" /></g>');
	});

	it("renders text children", () => {
		expect(
			Svg.vnodeToString({ tag: "text", props: { x: 0 }, children: "hi <&>" }),
		).toBe('<text x="0">hi &lt;&amp;></text>');
	});

	it("escapes attribute values", () => {
		expect(
			Svg.vnodeToString({ tag: "text", props: { "data-x": 'a"b&c<d' } }),
		).toBe('<text data-x="a&quot;b&amp;c&lt;d" />');
	});
});

const Circle = Entity.make("2d/Circle", {
	x: Schema.Number,
	y: Schema.Number,
});

const Label = Entity.make("2d/Label", {
	x: Schema.Number,
	text: Schema.String,
});

const circleLayer = Svg.entityRendererLayer(Circle, ({ id, data }) =>
	Effect.succeed({
		tag: "circle",
		props: { id, cx: data.x, cy: data.y, r: 10 },
	}),
);

// nested output: a group wrapping a text node
const labelLayer = Svg.entityRendererLayer(Label, ({ data }) =>
	Effect.succeed({
		tag: "g",
		props: { transform: `translate(${data.x},0)` },
		children: [{ tag: "text", props: { x: 0 }, children: data.text }],
	}),
);

const layers = Svg.layer.pipe(
	Layer.provideMerge([circleLayer, labelLayer, Svg.shapesLayer]),
);

type Entities = typeof Circle | typeof Label | typeof Shapes.Group;

// manual frames get a root group whose children are the given instances
const frameOf = (
	instances: Scene.Frame<Entities>["instances"],
): Scene.Frame<Entities> => ({
	instances: {
		...instances,
		root: {
			data: Shapes.Group.data.make({ children: Object.keys(instances) }),
			entity: Shapes.Group,
		},
	},
	root: "root",
	frameRate: 60,
	width: 500,
	height: 300,
	backgroundColor: "#16161d",
	camera: { x: 0, y: 0, zoom: 1 },
});

const circleFrame = frameOf({
	c1: { data: { x: 5, y: 6 }, entity: Circle },
});

const runWithLayers = <A>(effect: Effect.Effect<A, never, never>): Promise<A> =>
	Effect.runPromise(effect);

describe("SvgDomRenderer", () => {
	const render = (frame: Scene.Frame<Entities>, target: HTMLElement) =>
		runWithLayers(
			Effect.gen(function* () {
				const renderer = yield* Svg.SvgDomRenderer.Context;
				yield* renderer.render(frame, { target, width: 500, height: 300 });
			}).pipe(Effect.provide(layers)),
		);

	it("renders an svg root sized from config with namespaced elements", async () => {
		const target = document.createElement("div");
		await render(circleFrame, target);

		const svg = target.querySelector("svg");
		expect(svg?.getAttribute("width")).toBe("500");
		expect(svg?.getAttribute("height")).toBe("300");
		expect(svg?.namespaceURI).toBe("http://www.w3.org/2000/svg");

		const circle = target.querySelector("circle");
		expect(circle?.namespaceURI).toBe("http://www.w3.org/2000/svg");
		expect(circle?.getAttribute("cx")).toBe("5");
		expect(circle?.getAttribute("cy")).toBe("6");
	});

	it("materializes nested children", async () => {
		const target = document.createElement("div");
		await render(
			frameOf({ l1: { data: { x: 40, text: "hello" }, entity: Label } }),
			target,
		);

		const text = target.querySelector("g > text");
		expect(text?.namespaceURI).toBe("http://www.w3.org/2000/svg");
		expect(text?.textContent).toBe("hello");
	});

	it("re-render replaces the previous frame's content", async () => {
		const target = document.createElement("div");
		await render(circleFrame, target);
		await render(
			frameOf({ c2: { data: { x: 50, y: 60 }, entity: Circle } }),
			target,
		);

		const circles = target.querySelectorAll("circle");
		expect(circles).toHaveLength(1);
		expect(circles[0]?.getAttribute("cx")).toBe("50");
		expect(target.querySelectorAll("svg")).toHaveLength(1);
	});
});

describe("one entity renderer drives both sinks", () => {
	it("string and DOM output agree on tags and attributes", async () => {
		const target = document.createElement("div");
		const svgString = await runWithLayers(
			Effect.gen(function* () {
				const stringRenderer = yield* Svg.SvgRenderer.Context;
				const domRenderer = yield* Svg.SvgDomRenderer.Context;
				yield* domRenderer.render(circleFrame, {
					target,
					width: 500,
					height: 300,
				});
				return yield* stringRenderer.render(circleFrame, {
					width: 500,
					height: 300,
				});
			}).pipe(Effect.provide(layers)),
		);

		const domCircle = target.querySelector("circle");
		expect(domCircle).not.toBeNull();
		expect(svgString).toContain(`<circle id="c1" cx="5" cy="6" r="10" />`);
		expect(domCircle?.getAttribute("cx")).toBe("5");
		expect(domCircle?.getAttribute("r")).toBe("10");
	});
});
