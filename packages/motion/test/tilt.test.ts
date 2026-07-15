// @vitest-environment happy-dom
import { Effect, Layer } from "effect";
import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

type Entities = typeof Shapes.Rect | typeof Shapes.Group;
const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

const frameOf = (
	instances: Scene.Frame<Entities>["instances"],
	rootChildren: ReadonlyArray<string>,
): Scene.Frame<Entities> => ({
	instances: {
		...instances,
		root: {
			data: Shapes.Group.data.make({ children: rootChildren }),
			entity: Shapes.Group,
		},
	},
	root: "root",
	frameRate: 60,
	width: 500,
	height: 300,
	backgroundColor: "#000",
	camera: Camera.IDENTITY,
});

const renderString = (frame: Scene.Frame<Entities>) =>
	Effect.runPromise(
		Effect.gen(function* () {
			const r = yield* Svg.SvgRenderer.Context;
			return yield* r.render(frame, {});
		}).pipe(Effect.provide(layers)),
	);

const renderDom = (frame: Scene.Frame<Entities>, target: HTMLElement) =>
	Effect.runPromise(
		Effect.gen(function* () {
			const r = yield* Svg.SvgDomRenderer.Context;
			yield* r.render(frame, { target });
		}).pipe(Effect.provide(layers)),
	);

// a Rect centered on the viewport (250,150) so it sits on the camera axis,
// tilted about X so its top edge recedes and its bottom edge comes forward
const tiltedRectFrame = (rotX: number) =>
	frameOf(
		{
			r1: {
				data: Shapes.Rect.data.make({
					x: 150,
					y: 50,
					width: 200,
					height: 200,
					rotX,
					fill: "tomato",
				}),
				entity: Shapes.Rect,
			},
		},
		["r1"],
	);

describe("tilted solid planes render as exact polygons", () => {
	it("a tilted Rect emits a <polygon>, not a <rect>", async () => {
		const svg = await renderString(tiltedRectFrame(Math.PI / 4));
		expect(svg).toContain("<polygon");
		expect(svg).toContain('fill="tomato"');
		// the flat <rect> primitive is replaced by the projected polygon
		expect(svg).not.toContain("<rect x=");
	});

	it("an un-tilted Rect stays a plain <rect> (billboard)", async () => {
		const svg = await renderString(tiltedRectFrame(0));
		expect(svg).toContain("<rect");
		expect(svg).not.toContain("<polygon");
	});

	it("the receding plane is a trapezoid: far edge shorter than near edge", async () => {
		const svg = await renderString(tiltedRectFrame(Math.PI / 4));
		const points = svg.match(/points="([^"]+)"/)?.[1];
		expect(points).toBeDefined();
		const pts = points!
			.split(" ")
			.map((p) => p.split(",").map(Number) as [number, number]);
		// winding TL, TR, BR, BL: top edge = pts[0]->pts[1], bottom = pts[3]->pts[2]
		const topWidth = Math.abs(pts[1]![0] - pts[0]![0]);
		const bottomWidth = Math.abs(pts[2]![0] - pts[3]![0]);
		// top edge recedes (rotX tilts top away) → narrower on screen
		expect(topWidth).toBeLessThan(bottomWidth);
	});

	it("both sinks agree on the tilted polygon points", async () => {
		const frame = tiltedRectFrame(Math.PI / 3);
		const svg = await renderString(frame);
		const target = document.createElement("div");
		await renderDom(frame, target);
		const stringPoints = svg.match(/points="([^"]+)"/)?.[1];
		const domPoints = target.querySelector("polygon")?.getAttribute("points");
		expect(domPoints).toBe(stringPoints);
	});
});
