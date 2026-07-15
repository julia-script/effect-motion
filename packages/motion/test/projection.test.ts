import { describe, expect, it } from "vitest";
import * as P from "../src/Projection";

// The resting camera used across these tests: sits a focal-length back on
// +z, no rotation — the identity view that must reproduce plain-2D placement.
const F = P.DEFAULT_FOCAL_LENGTH;
const identity: P.CameraView = {
	x: 0,
	y: 0,
	z: P.defaultCameraZ(F),
	rotX: 0,
	rotY: 0,
	rotZ: 0,
	focalLength: F,
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

describe("tilted quad projects to a trapezoid", () => {
	it("a receding plane's far edge is shorter than its near edge", () => {
		// a plane tilted so its top edge (y-) recedes in depth: near edge at
		// z=0, far edge pushed to z=-400. Corners: TL, TR, BR, BL.
		const corners: [P.Vec3, P.Vec3, P.Vec3, P.Vec3] = [
			{ x: -100, y: -50, z: -400 }, // top-left, far
			{ x: 100, y: -50, z: -400 }, // top-right, far
			{ x: 100, y: 50, z: 0 }, // bottom-right, near
			{ x: -100, y: 50, z: 0 }, // bottom-left, near
		];
		const [tl, tr, br, bl] = P.projectQuad(identity, corners, origin);
		const farWidth = Math.abs(tr.x - tl.x);
		const nearWidth = Math.abs(br.x - bl.x);
		expect(farWidth).toBeLessThan(nearWidth);
	});
});

describe("planeCorners", () => {
	it("an un-rotated plane keeps its local rect corners at the world anchor", () => {
		const corners = P.planeCorners(
			{ x: 0, y: 0, width: 200, height: 100 },
			{ rotX: 0, rotY: 0, rotZ: 0 },
			{ x: 10, y: 20, z: 0 },
		);
		expect(corners[0]).toEqual({ x: 10, y: 20, z: 0 }); // TL
		expect(corners[1]).toEqual({ x: 210, y: 20, z: 0 }); // TR
		expect(corners[2]).toEqual({ x: 210, y: 120, z: 0 }); // BR
		expect(corners[3]).toEqual({ x: 10, y: 120, z: 0 }); // BL
	});

	it("a rotX tilt pushes the far edge in z and pulls the near edge back", () => {
		const corners = P.planeCorners(
			{ x: 0, y: 0, width: 100, height: 100 },
			{ rotX: Math.PI / 2, rotY: 0, rotZ: 0 },
			{ x: 0, y: 0, z: 0 },
		);
		// rotX 90°: the plane lies flat, its former y-extent becomes z-extent
		// TL/TR (y=0) stay at z=0; BL/BR (y=100) rotate to z≈100, y≈0
		expect(corners[2]!.z).toBeCloseTo(100, 6);
		expect(corners[2]!.y).toBeCloseTo(0, 6);
	});
});

describe("billboard affine", () => {
	it("scales by the projected scale and lands the anchor on screen", () => {
		// a shape anchored at world (0,0) under the resting camera projects to
		// screen (0,0) at scale 1 — the identity affine
		const p = P.project(identity, { x: 0, y: 0, z: 0 }, origin);
		const m = P.billboardAffine(p, { x: 0, y: 0 });
		expect(m.a).toBeCloseTo(1, 10);
		expect(m.d).toBeCloseTo(1, 10);
		expect(m.e).toBeCloseTo(0, 10);
		expect(m.f).toBeCloseTo(0, 10);
	});
});
