/**
 * The trait-removal gate (tasks 3.1–3.4).
 *
 * This change's whole argument is that traits are not REPLACED by the tagged
 * union — they are made UNNECESSARY by relative geometry. The three scenarios
 * the `traits` spec protected are ported here, and they must pass by writing
 * `position` alone, with no branch on entity tag inside the animator path.
 *
 * `readPosition`/`writePosition` below are the entity-agnostic replacements
 * for `traitOrDie(entity, "~position")` + `lens.get`/`lens.set`. Section 5
 * lifts them into `Motion.animatePosition` verbatim; if a `_tag` branch ever
 * has to appear in them, design D3 is wrong and the port must stop (3.4).
 */
import { describe, expect, it } from "vitest";
import * as S from "../src/schemas";

// ── the entire position "lens", for every entity, with no dispatch ───────

/** what `lens.get` was: every entity's position is `data.position` */
const readPosition = (data: { position: S.Vec3 }): S.Vec3 => data.position;

/**
 * What `lens.set` was. Partial targets hold the missing axis at its current
 * value — the channel-level sparseness rule (design D8) that must survive
 * `position` becoming a nested Vec3.
 */
const writePosition = <T extends { position: S.Vec3 }>(
	data: T,
	value: Partial<Pick<S.Vec3, "x" | "y" | "z">>,
): T => ({
	...data,
	position: S.vec3({
		x: value.x ?? data.position.x,
		y: value.y ?? data.position.y,
		z: value.z ?? data.position.z,
	}),
});

/** absolute world point of an offset — what a renderer composes */
const absolute = (position: S.Vec3, offset: S.Vec3) => ({
	x: position.x + offset.x,
	y: position.y + offset.y,
	z: position.z + offset.z,
});

describe("3.1 moving a Line does not stretch it", () => {
	it("a 50x20 line moved to (100,100) spans (100,100)→(150,120)", () => {
		const line = S.Line.make({
			start: S.vec3({ x: 0, y: 0, z: 0 }),
			end: S.vec3({ x: 50, y: 20, z: 0 }),
		});

		const moved = writePosition(line, { x: 100, y: 100 });

		expect(absolute(moved.position, moved.start)).toMatchObject({
			x: 100,
			y: 100,
		});
		expect(absolute(moved.position, moved.end)).toMatchObject({
			x: 150,
			y: 120,
		});
	});

	it("length and direction are untouched by the move", () => {
		const line = S.Line.make({
			start: S.vec3({ x: 0, y: 0, z: 0 }),
			end: S.vec3({ x: 50, y: 20, z: 0 }),
		});
		const moved = writePosition(line, { x: 100, y: 100 });
		// the offsets ARE the geometry, and the move never touched them
		expect(moved.start).toEqual(line.start);
		expect(moved.end).toEqual(line.end);
	});
});

describe("3.2 moving a Line in depth keeps it rigid", () => {
	it("a line spanning z 0→300 moved to z=100 sits at z 100→400", () => {
		const line = S.Line.make({
			start: S.vec3({ x: 0, y: 0, z: 0 }),
			end: S.vec3({ x: 50, y: 20, z: 300 }),
		});

		const moved = writePosition(line, { z: 100 });

		expect(absolute(moved.position, moved.start).z).toBe(100);
		expect(absolute(moved.position, moved.end).z).toBe(400);
		// same depth span
		expect(
			absolute(moved.position, moved.end).z -
				absolute(moved.position, moved.start).z,
		).toBe(300);
	});

	it("moving in z holds x and y (channel sparseness, D8)", () => {
		const line = S.Line.make({
			position: S.vec3({ x: 7, y: 9, z: 0 }),
			start: S.vec3({ x: 0, y: 0, z: 0 }),
			end: S.vec3({ x: 50, y: 20, z: 300 }),
		});
		const moved = writePosition(line, { z: 100 });
		expect(moved.position).toMatchObject({ x: 7, y: 9, z: 100 });
	});
});

describe("3.3 moving a Group moves its children", () => {
	it("children keep their local coordinates; world position follows", () => {
		const childA = S.Circle.make({ position: S.vec3({ x: 20, y: 0, z: 0 }) });
		const childB = S.Circle.make({ position: S.vec3({ x: -20, y: 0, z: 0 }) });
		const group = S.Group.make({
			position: S.vec3({ x: 100, y: 150, z: 0 }),
			children: ["a", "b"],
		});

		const moved = writePosition(group, { x: 400 });

		// the group moved; the children's own data did not change at all
		expect(moved.position.x).toBe(400);
		expect(childA.position.x).toBe(20);
		expect(childB.position.x).toBe(-20);

		// composing parent onto child is what the renderer's walk does
		expect(absolute(moved.position, childA.position).x).toBe(420);
		expect(absolute(moved.position, childB.position).x).toBe(380);
	});
});

describe("3.4 GATE: one implementation serves every entity", () => {
	/**
	 * The falsifying check. If `readPosition`/`writePosition` needed to know
	 * WHICH entity they were handed, traits would still be doing real work and
	 * D3 would be wrong. The proof they do not: the same two functions are
	 * applied to every paintable entity plus the camera, and every one behaves
	 * identically.
	 */
	it("reads and writes position on all ten entities, with no dispatch", () => {
		const entities = [
			S.Line.make({}),
			S.Path.make({ commands: [{ _tag: "M", x: 0, y: 0 }] }),
			S.Rect.make({}),
			S.Circle.make({}),
			S.Ellipse.make({}),
			S.Text.make({ text: "x" }),
			S.Group.make({}),
			S.Hud.make({}),
			S.Image.make({
				image: { _tag: "effect-motion/Resources/Image", id: "i" },
			}),
			S.Camera.make({}),
		];

		for (const entity of entities) {
			const moved = writePosition(entity, { x: 42, y: 7, z: -3 });
			expect(readPosition(moved)).toMatchObject({ x: 42, y: 7, z: -3 });
			// immutable, like the lens contract required
			expect(moved).not.toBe(entity);
			expect(readPosition(entity)).toMatchObject({ x: 0, y: 0, z: 0 });
		}
	});

	it("geometry-carrying entities translate rigidly under the same call", () => {
		// Line and Path are the two entities whose geometry used to need
		// per-entity handling. Neither needs any here.
		const line = S.Line.make({
			start: S.vec3({ x: 1, y: 2, z: 3 }),
			end: S.vec3({ x: 51, y: 22, z: 303 }),
		});
		const path = S.Path.make({
			commands: [
				{ _tag: "M", x: 0, y: 0 },
				{ _tag: "L", x: 60, y: 40, z: 120 },
			],
		});

		const movedLine = writePosition(line, { x: 100, y: 100, z: 100 });
		const movedPath = writePosition(path, { x: 100, y: 100, z: 100 });

		// geometry untouched in both cases — the position carries it
		expect(movedLine.start).toEqual(line.start);
		expect(movedLine.end).toEqual(line.end);
		expect(movedPath.commands).toEqual(path.commands);
	});

	it("Hud's z is a real value now, not fabricated by a lens", () => {
		// the old Hud lens returned z: 0 on read and DISCARDED z on write.
		// Under D12 it round-trips like any other entity.
		const hud = S.Hud.make({});
		const moved = writePosition(hud, { z: 12 });
		expect(readPosition(moved).z).toBe(12);
	});
});
