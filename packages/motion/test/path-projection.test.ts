import { describe, expect, it } from "vitest";
import * as P from "../src/Projection";

// Resting camera (see projection.test.ts): 720 wide → 1000px focal length,
// sitting a focal-length back on +z. Identity: z=0 world == screen.
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
const origin: P.Vec2 = { x: 250, y: 150 };

const open = (points: ReadonlyArray<P.Vec3>): P.Subpath3 => ({
	points,
	closed: false,
});
const closed = (points: ReadonlyArray<P.Vec3>): P.Subpath3 => ({
	points,
	closed: true,
});

describe("projectPath identity invariant", () => {
	it("an all-z=0 path under the resting camera keeps its coordinates", () => {
		const result = P.projectPath(
			identity,
			[
				open([
					{ x: 10, y: 20, z: 0 },
					{ x: 100, y: 40, z: 0 },
					{ x: 200, y: 250, z: 0 },
				]),
			],
			origin,
		);
		expect(result).toBeDefined();
		expect(result?.scale).toBeCloseTo(1, 10);
		expect(result?.depth).toBeCloseTo(F, 10);
		expect(result?.subpaths).toHaveLength(1);
		const points = result?.subpaths[0]?.points ?? [];
		expect(points[0]?.x).toBeCloseTo(10, 10);
		expect(points[0]?.y).toBeCloseTo(20, 10);
		expect(points[1]?.x).toBeCloseTo(100, 10);
		expect(points[2]?.y).toBeCloseTo(250, 10);
	});
});

describe("per-point foreshortening", () => {
	it("a farther point converges toward the optical axis", () => {
		// two points at the same lateral offset; the deeper one (world -z is
		// farther from the camera) lands nearer the viewport center
		const result = P.projectPath(
			identity,
			[
				open([
					{ x: origin.x + 100, y: origin.y, z: 0 },
					{ x: origin.x + 100, y: origin.y, z: -1000 },
				]),
			],
			origin,
		);
		const [near, far] = result?.subpaths[0]?.points ?? [];
		expect(near?.x).toBeCloseTo(origin.x + 100, 10);
		expect(far ? far.x - origin.x : Number.NaN).toBeCloseTo(50, 10); // F/(F+1000) = 0.5
	});
});

describe("near-plane clipping", () => {
	it("an open subpath splits where an interior point goes behind", () => {
		// A (front) — B (behind the camera) — C (front): two visible pieces
		const result = P.projectPath(
			identity,
			[
				open([
					{ x: 0, y: 0, z: 0 },
					{ x: 100, y: 0, z: identity.z + 500 },
					{ x: 200, y: 0, z: 0 },
				]),
			],
			origin,
		);
		expect(result?.subpaths).toHaveLength(2);
		expect(result?.subpaths[0]?.points).toHaveLength(2);
		expect(result?.subpaths[1]?.points).toHaveLength(2);
	});

	it("a closed subpath clips as a polygon and stays closed", () => {
		// triangle with one vertex behind the camera → 4-point polygon
		const result = P.projectPath(
			identity,
			[
				closed([
					{ x: -100, y: 0, z: 0 },
					{ x: 100, y: 0, z: 0 },
					{ x: 0, y: 100, z: identity.z + 500 },
				]),
			],
			origin,
		);
		expect(result?.subpaths).toHaveLength(1);
		expect(result?.subpaths[0]?.closed).toBe(true);
		expect(result?.subpaths[0]?.points).toHaveLength(4);
	});

	it("a path entirely behind the near plane culls", () => {
		const behind = identity.z + 100;
		const result = P.projectPath(
			identity,
			[
				open([
					{ x: 0, y: 0, z: behind },
					{ x: 50, y: 50, z: behind },
				]),
				closed([
					{ x: 0, y: 0, z: behind },
					{ x: 10, y: 0, z: behind },
					{ x: 0, y: 10, z: behind },
				]),
			],
			origin,
		);
		expect(result).toBeUndefined();
	});
});

describe("depth key", () => {
	it("depth is the mean view depth of visible points, scale follows", () => {
		// two points at world z 0 and -1000 → view depths F and F+1000
		const result = P.projectPath(
			identity,
			[
				open([
					{ x: 0, y: 0, z: 0 },
					{ x: 0, y: 0, z: -1000 },
				]),
			],
			origin,
		);
		expect(result?.depth).toBeCloseTo(F + 500, 10);
		expect(result?.scale).toBeCloseTo(F / (F + 500), 10);
	});
});

describe("determinism", () => {
	it("same camera + subpaths project bit-for-bit equal", () => {
		const subpaths = [
			open([
				{ x: 3, y: 7, z: -211 },
				{ x: 90, y: -14, z: 65 },
			]),
			closed([
				{ x: 0, y: 0, z: 0 },
				{ x: 40, y: 0, z: -30 },
				{ x: 0, y: 40, z: 12 },
			]),
		];
		const a = P.projectPath(identity, subpaths, origin);
		const b = P.projectPath(identity, subpaths, origin);
		expect(a).toEqual(b);
	});
});
