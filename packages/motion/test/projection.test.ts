import { describe, expect, it } from "vitest";
import * as P from "../src/Projection";

// The resting camera used across these tests: sits a focal-length back on
// +z, no rotation — the identity view that must reproduce plain-2D placement.
// 720 wide × 50/36 = a round 1000px focal length
const F = P.defaultFocalLength(720);
const identity: P.CameraView = {
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
const origin: P.Vec2 = { x: 250, y: 150 }; // viewport center of a 500x300 frame

describe("identity camera preserves plain-2D placement", () => {
	it("z=0 point projects to its own (x,y) at scale 1", () => {
		// resting camera reproduces plain-2D: world (x,y) == screen (x,y)
		const p = P.project(identity, { x: 40, y: -20, z: 0 }, origin);
		expect(p.scale).toBeCloseTo(1, 10);
		expect(p.x).toBeCloseTo(40, 10);
		expect(p.y).toBeCloseTo(-20, 10);
	});

	it("a point at the viewport center maps to the center", () => {
		const p = P.project(identity, { x: origin.x, y: origin.y, z: 0 }, origin);
		expect(p.x).toBeCloseTo(origin.x, 10);
		expect(p.y).toBeCloseTo(origin.y, 10);
	});
});

describe("determinism", () => {
	it("same camera + point projects bit-for-bit equal", () => {
		const a = P.project(identity, { x: 13, y: 7, z: -211 }, origin);
		const b = P.project(identity, { x: 13, y: 7, z: -211 }, origin);
		expect(a).toEqual(b);
	});
});

describe("depth drives scale (perspective foreshortening)", () => {
	it("a farther point is smaller", () => {
		const near = P.project(identity, { x: 0, y: 0, z: 0 }, origin);
		const far = P.project(identity, { x: 0, y: 0, z: -500 }, origin);
		expect(far.scale).toBeLessThan(near.scale);
		expect(far.depth).toBeGreaterThan(near.depth);
	});

	it("depth is the view-space distance in front of the camera", () => {
		// camera at z=F looking toward -z; a point at world z=0 is F in front
		expect(P.depthOf(identity, { x: 0, y: 0, z: 0 })).toBeCloseTo(F, 10);
		expect(P.depthOf(identity, { x: 0, y: 0, z: -100 })).toBeCloseTo(
			F + 100,
			10,
		);
	});

	it("a point behind the camera has zero scale (no valid projection)", () => {
		// world z beyond the camera's own z is behind it → view-z <= 0
		const behind = P.project(identity, { x: 0, y: 0, z: F + 10 }, origin);
		expect(behind.scale).toBe(0);
	});
});
