import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Color from "../src/Color";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { type Rendered, render } from "./support/framebuffer";

type Entities = typeof Shapes.Rect | typeof Shapes.Group;

const frameOf = (
	instances: Scene.Frame<Entities>["instances"],
	rootChildren: ReadonlyArray<string>,
	camera: Camera.CameraState = Camera.identity(500),
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
	backgroundColor: Color.hex("#000"),
	camera,
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
					fill: Color.hex("tomato"),
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

describe("a plane crossing the camera is near-plane clipped, not folded", () => {
	// the depth-3d floor: a big Rect lying nearly flat, its near edge swinging
	// toward the camera (rotX pushes local +y toward +z)
	const floor = (camera: Camera.CameraState) =>
		frameOf(
			{
				f1: {
					data: Shapes.Rect.data.make({
						x: -300,
						y: 180,
						z: -200,
						width: 900,
						height: 900,
						rotX: Math.PI / 2.3,
						fill: Color.hex("tomato"),
					}),
					entity: Shapes.Rect,
				},
			},
			["f1"],
			camera,
		);

	it("paints only the visible band when its near corners are behind the camera", async () => {
		// dolly the camera to z=300: the floor's near corners (world z≈681) are
		// behind it. The far edge projects to y = 150 + 30·(F/500) ≈ 192, so the
		// band below is painted and the viewport center is NOT — the old
		// unclipped projection pinned behind-corners to the center, covering it.
		const cam = { ...Camera.identity(500), z: 300 };
		const r = await render(floor(cam));
		expect(r.isPainted(250, 250)).toBe(true); // inside the visible band
		expect(r.isPainted(250, 150)).toBe(false); // center stays background
		expect(r.isPainted(250, 100)).toBe(false); // above the far edge too
	});

	it("a plane fully behind the camera paints nothing and does not die", async () => {
		// camera past every corner (nearest corner is at world z≈681)
		const cam = { ...Camera.identity(500), z: -1000 };
		const r = await render(floor(cam));
		expect(r.isPainted(250, 250)).toBe(false);
		expect(r.isPainted(250, 150)).toBe(false);
	});
});
