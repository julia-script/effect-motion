import { describe, expect, it } from "vitest";
import * as P from "../src/Projection";
import * as Runner from "../src/Runner";

// 720-wide resting camera (see projection.test.ts); world origin is the
// viewport center, so a POI at (0, 0, z) sits on the optical axis
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

const withPoi = (poi: P.Vec3, extra?: Partial<P.CameraView>): P.CameraView =>
	P.resolveCamera({
		...resting,
		...extra,
		poiX: poi.x,
		poiY: poi.y,
		poiZ: poi.z,
	});

describe("resolveCamera auto-orient", () => {
	it("the POI projects to the viewport center, wherever it sits", () => {
		const pois: P.Vec3[] = [
			{ x: 200, y: 0, z: 0 }, // right
			{ x: -150, y: 0, z: 0 }, // left
			{ x: 0, y: 120, z: 0 }, // above
			{ x: 0, y: -90, z: -400 }, // below + deep
			{ x: 130, y: 70, z: -900 }, // off both axes
		];
		for (const poi of pois) {
			const view = withPoi(poi);
			const projected = P.project(view, poi);
			expect(projected.x).toBeCloseTo(0, 8);
			expect(projected.y).toBeCloseTo(0, 8);
			expect(projected.depth).toBeGreaterThan(0);
		}
	});

	it("a POI on the optical axis derives zero orientation (orbit identity)", () => {
		const view = withPoi({ x: 0, y: 0, z: -500 });
		expect(view.rotX).toBeCloseTo(0, 12);
		expect(view.rotY).toBeCloseTo(0, 12);
		// and the whole view equals resting apart from untouched fields
		expect(view.z).toBe(resting.z);
	});

	it("dutch angle: rotZ rolls about the view axis, POI stays centered", () => {
		const poi: P.Vec3 = { x: 180, y: 60, z: -300 };
		const rolled = withPoi(poi, { rotZ: Math.PI / 8 });
		const straight = withPoi(poi);
		// roll is about the view axis, so the axis point itself stays centered
		// (the extracted Euler triple redistributes the roll — only the
		// composed VIEW is meaningful, so assert through projection)
		const projected = P.project(rolled, poi);
		expect(projected.x).toBeCloseTo(0, 8);
		expect(projected.y).toBeCloseTo(0, 8);
		// a satellite point rotates around the centered POI by the roll angle
		const side: P.Vec3 = { x: poi.x + 50, y: poi.y, z: poi.z };
		const sideStraight = P.project(straight, side);
		const sideRolled = P.project(rolled, side);
		const angleStraight = Math.atan2(sideStraight.y, sideStraight.x);
		const angleRolled = Math.atan2(sideRolled.y, sideRolled.x);
		let delta = angleRolled - angleStraight;
		if (delta > Math.PI) delta -= 2 * Math.PI;
		if (delta < -Math.PI) delta += 2 * Math.PI;
		expect(Math.abs(delta)).toBeCloseTo(Math.PI / 8, 5);
	});

	it("absent POI is a pass-through", () => {
		const view = P.resolveCamera(resting);
		expect(view).toBe(resting);
	});

	it("a partial POI is a loud defect", () => {
		expect(() => P.resolveCamera({ ...resting, poiX: 10, poiY: 20 })).toThrow(
			/partial POI/,
		);
	});

	it("user rotation fields are not written back", () => {
		const data = { ...resting, poiX: 400, poiY: 100, poiZ: -200 };
		P.resolveCamera(data);
		expect(data.rotX).toBe(0);
		expect(data.rotY).toBe(0);
	});
});

describe("POI camera end-to-end", () => {
	it("a world point at the POI projects to the viewport center", () => {
		// 200-wide comp: point far off-center at depth; camera aims at it
		const cam = {
			...Runner.identityCameraView(200),
			poiX: 60,
			poiY: -60,
			poiZ: -300,
		};
		const resolved = P.resolveCamera(cam);
		const proj = P.project(resolved, { x: 60, y: -60, z: -300 });
		expect(proj.x).toBeCloseTo(0, 6);
		expect(proj.y).toBeCloseTo(0, 6);
	});
});
