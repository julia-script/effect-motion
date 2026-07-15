import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { type Rendered, render } from "./support/framebuffer";

type Entities = typeof Shapes.Rect | typeof Shapes.Group;

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

// width of the painted span on a scanline: last painted x − first painted x
const paintedWidth = (r: Rendered, y: number): number => {
	let first = -1;
	let last = -1;
	for (let x = 0; x < r.width; x++) {
		if (r.isPainted(x, y)) {
			if (first === -1) {
				first = x;
			}
			last = x;
		}
	}
	return first === -1 ? 0 : last - first;
};

describe("tilted solid planes render as projected trapezoids", () => {
	it("a tilted Rect still paints (as its projected quad)", async () => {
		const r = await render(tiltedRectFrame(Math.PI / 4));
		// the plane covers the viewport center when tilted about its middle
		expect(r.isPainted(250, 150)).toBe(true);
	});

	it("the receding plane is a trapezoid: far edge narrower than near edge", async () => {
		const r = await render(tiltedRectFrame(Math.PI / 4));
		// rotX tilts the TOP edge away (recedes → narrower on screen) and brings
		// the BOTTOM edge forward (wider). Compare a high scanline to a low one.
		const topWidth = paintedWidth(r, 110);
		const bottomWidth = paintedWidth(r, 190);
		expect(topWidth).toBeGreaterThan(0);
		expect(bottomWidth).toBeGreaterThan(0);
		expect(topWidth).toBeLessThan(bottomWidth);
	});

	it("an un-tilted Rect paints a uniform-width rectangle (billboard)", async () => {
		const r = await render(tiltedRectFrame(0));
		// no tilt → the painted span is the same width top and bottom
		const topWidth = paintedWidth(r, 110);
		const bottomWidth = paintedWidth(r, 190);
		expect(topWidth).toBeGreaterThan(0);
		expect(Math.abs(topWidth - bottomWidth)).toBeLessThanOrEqual(2);
	});
});
