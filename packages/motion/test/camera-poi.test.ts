import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Color from "../src/Color";
import * as P from "../src/Projection";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { render } from "./support/framebuffer";

// 720-wide resting camera (see projection.test.ts) and a 500x300 viewport
const F = P.defaultFocalLength(720);
const resting: P.CameraView = {
	x: 0,
	y: 0,
	z: P.defaultCameraZ(F),
	rotX: 0,
	rotY: 0,
	rotZ: 0,
	focalLength: F,
	focusDistance: P.defaultCameraZ(F),
	aperture: 0,
};
const origin: P.Vec2 = { x: 250, y: 150 };

const withPoi = (poi: P.Vec3, extra?: Partial<P.CameraView>): P.CameraView =>
	P.resolveCamera(
		{ ...resting, ...extra, poiX: poi.x, poiY: poi.y, poiZ: poi.z },
		origin,
	);

describe("resolveCamera auto-orient", () => {
	it("the POI projects to the viewport center, wherever it sits", () => {
		const pois: P.Vec3[] = [
			{ x: origin.x + 200, y: origin.y, z: 0 }, // right
			{ x: origin.x - 150, y: origin.y, z: 0 }, // left
			{ x: origin.x, y: origin.y - 120, z: 0 }, // above
			{ x: origin.x, y: origin.y + 90, z: -400 }, // below + deep
			{ x: origin.x + 130, y: origin.y - 70, z: -900 }, // off both axes
		];
		for (const poi of pois) {
			const view = withPoi(poi);
			const projected = P.project(view, poi, origin);
			expect(projected.x).toBeCloseTo(origin.x, 8);
			expect(projected.y).toBeCloseTo(origin.y, 8);
			expect(projected.depth).toBeGreaterThan(0);
		}
	});

	it("a POI on the optical axis derives zero orientation (orbit identity)", () => {
		const view = withPoi({ x: origin.x, y: origin.y, z: -500 });
		expect(view.rotX).toBeCloseTo(0, 12);
		expect(view.rotY).toBeCloseTo(0, 12);
		// and the whole view equals resting apart from untouched fields
		expect(view.z).toBe(resting.z);
	});

	it("dutch angle: rotZ rolls about the view axis, POI stays centered", () => {
		const poi: P.Vec3 = { x: origin.x + 180, y: origin.y - 60, z: -300 };
		const rolled = withPoi(poi, { rotZ: Math.PI / 8 });
		const straight = withPoi(poi);
		// roll is about the view axis, so the axis point itself stays centered
		// (the extracted Euler triple redistributes the roll — only the
		// composed VIEW is meaningful, so assert through projection)
		const projected = P.project(rolled, poi, origin);
		expect(projected.x).toBeCloseTo(origin.x, 8);
		expect(projected.y).toBeCloseTo(origin.y, 8);
		// a satellite point rotates around the centered POI by the roll angle
		const side: P.Vec3 = { x: poi.x + 50, y: poi.y, z: poi.z };
		const sideStraight = P.project(straight, side, origin);
		const sideRolled = P.project(rolled, side, origin);
		const angleStraight = Math.atan2(
			sideStraight.y - origin.y,
			sideStraight.x - origin.x,
		);
		const angleRolled = Math.atan2(
			sideRolled.y - origin.y,
			sideRolled.x - origin.x,
		);
		let delta = angleRolled - angleStraight;
		if (delta > Math.PI) delta -= 2 * Math.PI;
		if (delta < -Math.PI) delta += 2 * Math.PI;
		expect(Math.abs(delta)).toBeCloseTo(Math.PI / 8, 5);
	});

	it("absent POI is a pass-through", () => {
		const view = P.resolveCamera(resting, origin);
		expect(view).toBe(resting);
	});

	it("a partial POI is a loud defect", () => {
		expect(() =>
			P.resolveCamera({ ...resting, poiX: 10, poiY: 20 }, origin),
		).toThrow(/partial POI/);
	});

	it("user rotation fields are not written back", () => {
		const data = { ...resting, poiX: 400, poiY: 100, poiZ: -200 };
		P.resolveCamera(data, origin);
		expect(data.rotX).toBe(0);
		expect(data.rotY).toBe(0);
	});
});

describe("POI camera end-to-end", () => {
	type Entities = typeof Shapes.Circle | typeof Shapes.Group;
	it("a shape at the POI renders at the viewport center", async () => {
		// 200×200 frame: shape far off-center at depth; camera aims at it
		const cam = {
			...Camera.identity(200),
			poiX: 160,
			poiY: 40,
			poiZ: -300,
		};
		const frame: Scene.Frame<Entities> = {
			instances: {
				c: {
					data: Shapes.Circle.data.make({
						x: 160,
						y: 40,
						z: -300,
						radius: 10,
						fill: Color.hex("#00ff00"),
					}),
					entity: Shapes.Circle,
				},
				root: {
					data: Shapes.Group.data.make({ children: ["c"] }),
					entity: Shapes.Group,
				},
			},
			root: "root",
			frameRate: 60,
			width: 200,
			height: 200,
			backgroundColor: Color.hex("#000000"),
			camera: cam,
		} as Scene.Frame<Entities>;
		const r = await render(frame);
		expect(r.isPainted(100, 100)).toBe(true); // centered under the aim
		expect(r.isPainted(160, 40)).toBe(false); // not at its unaimed position
	});
});
