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

describe("projectPlane: tilted quad projects to a clipped screen polygon", () => {
	it("a receding plane's far edge is shorter than its near edge", () => {
		// a plane tilted so its top edge (y-) recedes in depth: near edge at
		// z=0, far edge pushed to z=-400. Corners: TL, TR, BR, BL.
		const corners: [P.Vec3, P.Vec3, P.Vec3, P.Vec3] = [
			{ x: -100, y: -50, z: -400 }, // top-left, far
			{ x: 100, y: -50, z: -400 }, // top-right, far
			{ x: 100, y: 50, z: 0 }, // bottom-right, near
			{ x: -100, y: 50, z: 0 }, // bottom-left, near
		];
		const projected = P.projectPlane(identity, corners, origin);
		// fully in front of the camera: nothing clipped, winding preserved
		expect(projected).toHaveLength(4);
		const [tl, tr, br, bl] = projected as [P.Vec2, P.Vec2, P.Vec2, P.Vec2];
		const farWidth = Math.abs(tr.x - tl.x);
		const nearWidth = Math.abs(br.x - bl.x);
		expect(farWidth).toBeLessThan(nearWidth);
	});

	it("a quad straddling the camera plane is clipped, not folded", () => {
		// bottom edge BEHIND the camera (world z beyond the camera's own z).
		// The old projection pinned behind-corners to the viewport center;
		// clipping instead yields a polygon whose vertices all project finitely
		// and whose clipped edge sits at the near plane.
		const corners: [P.Vec3, P.Vec3, P.Vec3, P.Vec3] = [
			{ x: -100, y: -50, z: 0 }, // top-left, in front (depth F)
			{ x: 100, y: -50, z: 0 }, // top-right, in front
			{ x: 100, y: 50, z: F + 100 }, // bottom-right, behind
			{ x: -100, y: 50, z: F + 100 }, // bottom-left, behind
		];
		const projected = P.projectPlane(identity, corners, origin);
		// two in-front corners kept + two clip intersections
		expect(projected).toHaveLength(4);
		// no vertex collapses onto the viewport center (the old folding bug)
		for (const v of projected) {
			expect(Number.isFinite(v.x)).toBe(true);
			expect(Number.isFinite(v.y)).toBe(true);
			expect(
				Math.abs(v.x - origin.x) + Math.abs(v.y - origin.y),
			).toBeGreaterThan(1);
		}
	});

	it("clipping one corner off a quad yields five vertices", () => {
		const corners: [P.Vec3, P.Vec3, P.Vec3, P.Vec3] = [
			{ x: -100, y: -50, z: 0 },
			{ x: 100, y: -50, z: 0 },
			{ x: 100, y: 50, z: F + 100 }, // only this corner is behind
			{ x: -100, y: 50, z: 0 },
		];
		expect(P.projectPlane(identity, corners, origin)).toHaveLength(5);
	});

	it("a plane fully behind the camera projects to nothing", () => {
		const corners: [P.Vec3, P.Vec3, P.Vec3, P.Vec3] = [
			{ x: -100, y: -50, z: F + 10 },
			{ x: 100, y: -50, z: F + 10 },
			{ x: 100, y: 50, z: F + 100 },
			{ x: -100, y: 50, z: F + 100 },
		];
		expect(P.projectPlane(identity, corners, origin)).toHaveLength(0);
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
		expect(corners[2]?.z).toBeCloseTo(100, 6);
		expect(corners[2]?.y).toBeCloseTo(0, 6);
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

describe("projectSegment (skeletal shapes)", () => {
	it("flat segment under the resting camera is identity", () => {
		const s = P.projectSegment(
			identity,
			{ x: 10, y: 20, z: 0 },
			{ x: 200, y: 80, z: 0 },
			origin,
		)!;
		expect(s.a.x).toBeCloseTo(10, 10);
		expect(s.a.y).toBeCloseTo(20, 10);
		expect(s.b.x).toBeCloseTo(200, 10);
		expect(s.b.y).toBeCloseTo(80, 10);
		expect(s.scale).toBeCloseTo(1, 10);
	});

	it("endpoints foreshorten independently", () => {
		// a rail receding from z=0 toward the horizon: the far end pulls
		// toward the viewport center, the near end stays put
		const s = P.projectSegment(
			identity,
			{ x: 100, y: 100, z: 0 },
			{ x: 100, y: 100, z: -4000 },
			origin,
		)!;
		expect(s.a.x).toBeCloseTo(100, 10);
		expect(s.a.y).toBeCloseTo(100, 10);
		// far end: same world x/y but deeper — projected strictly between
		// the near end and the viewport center
		expect(s.b.x).toBeGreaterThan(100);
		expect(s.b.x).toBeLessThan(origin.x);
		expect(s.b.y).toBeGreaterThan(100);
		expect(s.b.y).toBeLessThan(origin.y);
	});

	it("midpoint depth and scale are the segment's keys", () => {
		const s = P.projectSegment(
			identity,
			{ x: 0, y: 0, z: 0 },
			{ x: 0, y: 0, z: -1000 },
			origin,
		)!;
		// view depths: F (z=0) and F+1000 (z=-1000) → midpoint F+500
		expect(s.depth).toBeCloseTo(F + 500, 10);
		expect(s.scale).toBeCloseTo(F / (F + 500), 10);
	});

	it("a segment straddling the camera clips to the near plane", () => {
		// start in front of the camera plane, end behind it
		const s = P.projectSegment(
			identity,
			{ x: 0, y: 0, z: 0 },
			{ x: 0, y: 0, z: identity.z + 500 },
			origin,
		)!;
		expect(s).toBeDefined();
		// the visible part runs from the front endpoint toward the camera;
		// both screen points are finite (no folded/mirrored projection)
		expect(Number.isFinite(s.b.x)).toBe(true);
		expect(Number.isFinite(s.b.y)).toBe(true);
		expect(s.depth).toBeGreaterThan(0);
	});

	it("a segment fully behind the camera culls", () => {
		const s = P.projectSegment(
			identity,
			{ x: 0, y: 0, z: identity.z + 100 },
			{ x: 0, y: 0, z: identity.z + 500 },
			origin,
		);
		expect(s).toBeUndefined();
	});

	it("is deterministic", () => {
		const args = [
			{ x: 3, y: 7, z: -50 },
			{ x: -40, y: 12, z: 900 },
		] as const;
		const a = P.projectSegment(identity, args[0], args[1], origin);
		const b = P.projectSegment(identity, args[0], args[1], origin);
		expect(a).toEqual(b);
	});
});

describe("clipSegmentToRect (viewport clipping)", () => {
	const min = { x: 0, y: 0 };
	const max = { x: 500, y: 300 };

	it("a fully-inside segment is returned untouched (same references)", () => {
		const a = { x: 10, y: 10 };
		const b = { x: 400, y: 200 };
		const r = P.clipSegmentToRect(a, b, min, max)!;
		expect(r[0]).toBe(a);
		expect(r[1]).toBe(b);
	});

	it("a segment crossing one edge clips to the boundary", () => {
		const r = P.clipSegmentToRect(
			{ x: 250, y: 150 },
			{ x: 1000, y: 150 },
			min,
			max,
		)!;
		expect(r[0]).toEqual({ x: 250, y: 150 });
		expect(r[1].x).toBeCloseTo(500, 10);
		expect(r[1].y).toBeCloseTo(150, 10);
	});

	it("a segment spanning the rect clips both endpoints", () => {
		const r = P.clipSegmentToRect(
			{ x: -10000, y: 150 },
			{ x: 10000, y: 150 },
			min,
			max,
		)!;
		expect(r[0].x).toBeCloseTo(0, 10);
		expect(r[1].x).toBeCloseTo(500, 10);
	});

	it("a diagonal through a corner region keeps only the inside run", () => {
		const r = P.clipSegmentToRect(
			{ x: -100, y: -100 },
			{ x: 700, y: 700 },
			min,
			max,
		)!;
		expect(r[0].x).toBeCloseTo(0, 10);
		expect(r[0].y).toBeCloseTo(0, 10);
		expect(r[1].x).toBeCloseTo(300, 10);
		expect(r[1].y).toBeCloseTo(300, 10);
	});

	it("fully-outside segments cull, including axis-parallel ones", () => {
		expect(
			P.clipSegmentToRect({ x: -50, y: 150 }, { x: -10, y: 150 }, min, max),
		).toBeUndefined();
		expect(
			P.clipSegmentToRect({ x: 0, y: 400 }, { x: 500, y: 400 }, min, max),
		).toBeUndefined();
		// outside on a shared side but diagonal
		expect(
			P.clipSegmentToRect({ x: 600, y: -50 }, { x: 900, y: 350 }, min, max),
		).toBeUndefined();
	});
});

describe("projectPath: skeletal n-point projection", () => {
	it("flat points under the resting camera project to authored coords", () => {
		const points: P.Vec3[] = [
			{ x: 60, y: 40, z: 0 },
			{ x: 160, y: 40, z: 0 },
			{ x: 110, y: 140, z: 0 },
		];
		const r = P.projectPath(identity, points, true, origin)!;
		expect(r.clipped).toBe(false);
		expect(r.scale).toBeCloseTo(1, 10);
		expect(r.depth).toBeCloseTo(F, 10);
		expect(r.runs).toHaveLength(1);
		for (const [i, p] of points.entries()) {
			expect(r.runs[0]?.[i]?.x).toBeCloseTo(p.x, 10);
			expect(r.runs[0]?.[i]?.y).toBeCloseTo(p.y, 10);
			expect(r.contour[i]?.x).toBeCloseTo(p.x, 10);
			expect(r.contour[i]?.y).toBeCloseTo(p.y, 10);
		}
	});

	it("a deeper vertex pulls toward the viewport center", () => {
		const r = P.projectPath(
			identity,
			[
				{ x: 300, y: 200, z: 0 },
				{ x: 300, y: 200, z: -4000 },
			],
			false,
			origin,
		)!;
		const near = r.runs[0]?.[0];
		const far = r.runs[0]?.[1];
		expect(near?.x).toBeCloseTo(300, 10);
		expect(near?.y).toBeCloseTo(200, 10);
		const farScale = F / (F + 4000);
		expect(far?.x).toBeCloseTo(origin.x + (300 - origin.x) * farScale, 10);
		expect(far?.y).toBeCloseTo(origin.y + (200 - origin.y) * farScale, 10);
	});

	it("a path entirely behind the near plane culls", () => {
		const behind = identity.z + 100;
		expect(
			P.projectPath(
				identity,
				[
					{ x: 0, y: 0, z: behind },
					{ x: 100, y: 0, z: behind + 50 },
				],
				false,
				origin,
			),
		).toBeUndefined();
		expect(P.projectPath(identity, [], false, origin)).toBeUndefined();
	});

	it("a behind-camera middle vertex splits an open path into two runs", () => {
		const behind = identity.z + 200;
		const r = P.projectPath(
			identity,
			[
				{ x: 0, y: 0, z: 0 },
				{ x: 100, y: 0, z: behind },
				{ x: 200, y: 0, z: 0 },
			],
			false,
			origin,
		)!;
		expect(r.clipped).toBe(true);
		expect(r.runs).toHaveLength(2);
		// each run starts/ends at a clip point on the near plane, never at the
		// invalid behind-camera projection
		expect(r.runs[0]).toHaveLength(2);
		expect(r.runs[1]).toHaveLength(2);
		expect(r.runs[0]?.[0]?.x).toBeCloseTo(0, 10);
		expect(r.runs[1]?.[1]?.x).toBeCloseTo(200, 10);
	});

	it("a clipped ring's visible stretch wrapping vertex 0 stays one run", () => {
		const behind = identity.z + 200;
		const r = P.projectPath(
			identity,
			[
				{ x: 0, y: 0, z: 0 },
				{ x: 100, y: 0, z: 0 },
				{ x: 100, y: 100, z: 0 },
				{ x: 0, y: 100, z: behind },
			],
			true,
			origin,
		)!;
		expect(r.clipped).toBe(true);
		// edges 0-1, 1-2 visible; 2-3 exit-clips; 3-0 enter-clips — the seam at
		// vertex 0 is stitched, leaving a single polyline through all of them
		expect(r.runs).toHaveLength(1);
		const run = r.runs[0]!;
		expect(run).toHaveLength(5);
		expect(run[1]?.x).toBeCloseTo(0, 10); // vertex 0 mid-run, not a cap
		expect(run[1]?.y).toBeCloseTo(0, 10);
	});

	it("same camera + points project bit-for-bit equal", () => {
		const pts: P.Vec3[] = [
			{ x: 13, y: 7, z: -211 },
			{ x: 90, y: -40, z: 35 },
		];
		expect(P.projectPath(identity, pts, false, origin)).toEqual(
			P.projectPath(identity, pts, false, origin),
		);
	});
});
