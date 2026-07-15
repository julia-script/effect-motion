import { describe, expect, it } from "vitest";
import {
	type Camera3D,
	depthOrder,
	project,
	type Viewport,
} from "../src/Projection";

// EXPERIMENTAL — proves the 2.5D projection core (see src/Projection.ts and
// openspec/changes/add-2.5d-projection/). The load-bearing claims:
//   1. a world point projects to a screen anchor + a perspective scale;
//   2. points behind the camera are culled;
//   3. PAINT ORDER IS DECIDED BY CAMERA-SPACE DEPTH, not tree/input order;
//   4. moving the camera flips that order — the tree never changed;
//   5. the sort is deterministic (explicit index tiebreak on equal depth).

const viewport: Viewport = { width: 800, height: 600 };

// looking down +Z from z = -500 at the origin plane (reference distance 500)
const front: Camera3D = {
	position: { x: 0, y: 0, z: -500 },
	target: { x: 0, y: 0, z: 0 },
};

describe("world → screen projection", () => {
	it("renders the reference plane at authored size, centered on the axis", () => {
		const p = project({ x: 0, y: 0, z: 0 }, front, viewport);
		expect(p.visible).toBe(true);
		// a point on the eye→target axis lands dead center
		expect(p.x).toBeCloseTo(400);
		expect(p.y).toBeCloseTo(300);
		// the reference plane keeps authored size
		expect(p.scale).toBeCloseTo(1);
	});

	it("maps world +X right and world +Y up on screen", () => {
		const p = project({ x: 100, y: 50, z: 0 }, front, viewport);
		expect(p.x).toBeCloseTo(500); // +X → right of center
		expect(p.y).toBeCloseTo(250); // +Y → above center (smaller screen Y)
	});

	it("shrinks farther points and grows nearer ones (perspective)", () => {
		const near = project({ x: 0, y: 0, z: -200 }, front, viewport); // depth 300
		const far = project({ x: 0, y: 0, z: 200 }, front, viewport); // depth 700
		expect(near.scale).toBeGreaterThan(1);
		expect(far.scale).toBeLessThan(1);
		expect(near.depth).toBeCloseTo(300);
		expect(far.depth).toBeCloseTo(700);
	});

	it("pulls off-axis points toward the vanishing point as they recede", () => {
		const near = project({ x: 100, y: 0, z: -200 }, front, viewport);
		const far = project({ x: 100, y: 0, z: 400 }, front, viewport);
		// both right of center, but the far one is closer to it
		expect(near.x - 400).toBeGreaterThan(far.x - 400);
		expect(far.x).toBeGreaterThan(400);
	});

	it("orthographic projection keeps size flat but preserves depth", () => {
		const ortho: Camera3D = { ...front, projection: "orthographic" };
		const near = project({ x: 0, y: 0, z: -200 }, ortho, viewport);
		const far = project({ x: 0, y: 0, z: 200 }, ortho, viewport);
		expect(near.scale).toBeCloseTo(1);
		expect(far.scale).toBeCloseTo(1);
		// depth still orders them
		expect(far.depth).toBeGreaterThan(near.depth);
	});

	it("culls points at or behind the camera", () => {
		const behind = project({ x: 0, y: 0, z: -600 }, front, viewport);
		expect(behind.visible).toBe(false);
	});
});

// three cards, deliberately given in an order that is NOT their depth order,
// to show the tree/input order does not survive.
interface Card {
	readonly name: string;
	readonly at: Vec3;
}
type Vec3 = Camera3D["position"];

const cards: ReadonlyArray<Card> = [
	{ name: "mid", at: { x: 0, y: 0, z: 0 } },
	{ name: "far", at: { x: 0, y: 0, z: 300 } },
	{ name: "near", at: { x: 0, y: 0, z: -300 } },
];

const paintOrder = (camera: Camera3D): ReadonlyArray<string> =>
	depthOrder(cards, (c) => project(c.at, camera, viewport).depth).map(
		(c) => c.name,
	);

describe("depth decides paint order, not the tree", () => {
	it("paints back-to-front regardless of input order", () => {
		// input order is mid, far, near — output must be far → mid → near
		expect(paintOrder(front)).toEqual(["far", "mid", "near"]);
	});

	it("flips when the camera moves to the other side (tree unchanged)", () => {
		const back: Camera3D = {
			position: { x: 0, y: 0, z: 500 },
			target: { x: 0, y: 0, z: 0 },
		};
		// same cards, same array, opposite viewpoint → order reverses
		expect(paintOrder(back)).toEqual(["near", "mid", "far"]);
	});

	it("orders deterministically, breaking exact-depth ties by input index", () => {
		// two cards at the identical depth: input order is the tiebreak
		const tied: ReadonlyArray<Card> = [
			{ name: "second", at: { x: 200, y: 0, z: 0 } },
			{ name: "first", at: { x: -200, y: 0, z: 0 } },
		];
		const run = () =>
			depthOrder(tied, (c) => project(c.at, front, viewport).depth).map(
				(c) => c.name,
			);
		// same depth → preserves input order, and is identical across runs
		expect(run()).toEqual(["second", "first"]);
		expect(run()).toEqual(run());
	});
});
