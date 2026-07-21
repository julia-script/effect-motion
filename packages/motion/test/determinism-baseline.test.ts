/**
 * Determinism baseline capture / verification (task 1.2).
 *
 * TEMPORARY — this file exists for the close-the-entity-world port and is
 * deleted at task 8.6 once the comparison is done.
 *
 * It writes a JSON snapshot of SEMANTIC per-frame values to
 * `test/__baseline__/determinism.json`. Run it before the port to record, and
 * after the port to compare.
 *
 * Why not raw frame JSON: the port renames fields (x/y/z -> position.x,
 * ~visible -> visible, x2/y2/z2 -> start/end offsets). A byte-diff of frames
 * would be 100% noise. The readers below normalize the OLD and NEW shapes to
 * the same output — notably resolving Line endpoints to ABSOLUTE world
 * coordinates in both, since the representation is allowed to change but the
 * rendered geometry is not.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Random, Schedule } from "effect";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as Motion from "../src/Motion";
import * as Physics from "../src/Physics";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";

const OUT = join(__dirname, "__baseline__", "determinism.json");

const round = (n: number) => Math.round(n * 1e6) / 1e6;

type Data = Record<string, unknown>;

/** position: flat x/y/z (before) or nested position:{x,y,z} (after) */
const readPos = (d: Data) => {
	const p = d.position as Record<string, number> | undefined;
	if (p !== undefined && typeof p === "object") {
		return { x: p.x ?? 0, y: p.y ?? 0, z: p.z ?? 0 };
	}
	return {
		x: typeof d.x === "number" ? d.x : 0,
		y: typeof d.y === "number" ? d.y : 0,
		z: typeof d.z === "number" ? d.z : 0,
	};
};

/** visible: `~visible` (before) or `visible` (after) */
const readVisible = (d: Data) => {
	if (typeof d.visible === "boolean") return d.visible;
	if (typeof d["~visible"] === "boolean") return d["~visible"];
	return true;
};

/**
 * Line endpoints as ABSOLUTE world coordinates, from either representation:
 * absolute x2/y2/z2 (before) or start/end offsets from position (after).
 */
const readLine = (d: Data) => {
	const pos = readPos(d);
	const start = d.start as Record<string, number> | undefined;
	const end = d.end as Record<string, number> | undefined;
	if (start !== undefined && end !== undefined) {
		return {
			ax: pos.x + (start.x ?? 0),
			ay: pos.y + (start.y ?? 0),
			az: pos.z + (start.z ?? 0),
			bx: pos.x + (end.x ?? 0),
			by: pos.y + (end.y ?? 0),
			bz: pos.z + (end.z ?? 0),
		};
	}
	if (typeof d.x2 === "number") {
		return {
			ax: pos.x,
			ay: pos.y,
			az: pos.z,
			bx: d.x2,
			by: typeof d.y2 === "number" ? d.y2 : 0,
			bz: typeof d.z2 === "number" ? d.z2 : 0,
		};
	}
	return null;
};

const num = (d: Data, key: string, out: Data) => {
	const v = d[key];
	if (typeof v === "number") out[key] = round(v);
};

const readEntity = (id: string, data: unknown): Data => {
	const d = (data ?? {}) as Data;
	const pos = readPos(d);
	const out: Data = {
		id,
		x: round(pos.x),
		y: round(pos.y),
		z: round(pos.z),
		visible: readVisible(d),
	};
	for (const key of [
		"opacity",
		"radius",
		"width",
		"height",
		"radiusX",
		"radiusY",
		"fontSize",
	]) {
		num(d, key, out);
	}
	if (typeof d.text === "string") out.text = d.text;
	if (Array.isArray(d.children)) out.children = d.children;
	if (Array.isArray(d.commands)) out.commandCount = d.commands.length;
	const line = readLine(d);
	if (line !== null) {
		out.line = Object.fromEntries(
			Object.entries(line).map(([k, v]) => [k, round(v)]),
		);
	}
	return out;
};

const readCamera = (c: unknown): Data => {
	const d = (c ?? {}) as Data;
	const pos = readPos(d);
	const out: Data = { x: round(pos.x), y: round(pos.y), z: round(pos.z) };
	for (const key of ["focalLength", "aperture", "focusDistance"]) {
		num(d, key, out);
	}
	return out;
};

const capture = (frames: ReadonlyArray<unknown>) =>
	frames.map((frame) => {
		const f = frame as {
			instances: Record<string, { data: unknown }>;
			camera: unknown;
		};
		return {
			entities: Object.entries(f.instances)
				.map(([id, entry]) => readEntity(id, entry.data))
				.sort((a, b) => String(a.id).localeCompare(String(b.id))),
			camera: readCamera(f.camera),
		};
	});

const comp = { width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) };

// Scenes chosen to cover every concern design.md names: springs (settle-exact),
// eased tweens (exact final frame), groups (subtree), a Line (rigid
// translation), a Path (anchor-local commands), and seeded randomness.
const scenes = {
	// mirrors examples/springs.scene.ts — no durations, settle-driven
	springs: Scene.make(function* () {
		const ball = yield* Scene.instantiate(Shapes.Circle, {
			x: 250,
			y: 150,
			radius: 1,
			fill: Color.hex("#ff8906"),
		});
		yield* ball.pipe(
			Motion.tweenTo({ radius: 24 }, "700 millis", "easeOutElastic"),
			Physics.springTo({ x: 430 }, "swing"),
			Physics.springTo({ x: 70 }, "bounce"),
			Physics.springTo({ x: 250, y: 70 }, "jump"),
		);
	}, comp),

	// eased tweens across several timing curves + fade
	easing: Scene.make(function* () {
		const a = yield* Scene.instantiate(Shapes.Circle, { x: 40, y: 60, radius: 12 });
		const b = yield* Scene.instantiate(Shapes.Circle, { x: 40, y: 140, radius: 12 });
		yield* Scene.all([
			a.pipe(Motion.moveTo({ x: 440 }, "1 second", "easeInOutCubic")),
			b.pipe(Motion.moveTo({ x: 440 }, "1 second", "easeOutBounce")),
		]);
		yield* a.pipe(Motion.fadeTo(0, "500 millis"));
	}, comp),

	// group subtree motion — the trait-removal gate's third scenario
	groups: Scene.make(function* () {
		const c1 = yield* Scene.instantiate(Shapes.Circle, { x: 20, y: 0, radius: 10 });
		const c2 = yield* Scene.instantiate(Shapes.Circle, { x: -20, y: 0, radius: 10 });
		const g = yield* Scene.instantiate(Shapes.Group, {
			x: 100,
			y: 150,
			children: [c1, c2],
		});
		yield* g.pipe(Motion.moveTo({ x: 400 }, "800 millis", "easeInOutQuad"));
		yield* g.pipe(Motion.fadeTo(0.25, "400 millis"));
	}, comp),

	// Line rigid translation — the gate's first two scenarios
	line: Scene.make(function* () {
		const l = yield* Scene.instantiate(Shapes.Line, {
			x: 0,
			y: 0,
			z: 0,
			x2: 50,
			y2: 20,
			z2: 300,
		});
		yield* l.pipe(Motion.moveTo({ x: 100, y: 100 }, "500 millis"));
		yield* l.pipe(Motion.moveTo({ z: 100 }, "500 millis"));
	}, comp),

	// Path — anchor moves, commands untouched
	path: Scene.make(function* () {
		const p = yield* Scene.instantiate(Shapes.Path, {
			x: 50,
			y: 50,
			commands: [
				{ _tag: "M", x: 0, y: 0 },
				{ _tag: "L", x: 60, y: 40, z: 120 },
				{ _tag: "L", x: 120, y: 0 },
			],
		});
		yield* p.pipe(Motion.moveTo({ x: 300, y: 200 }, "600 millis", "easeInOutSine"));
	}, comp),

	// seeded randomness must reproduce exactly across the port
	seeded: Scene.make(function* () {
		const dots = [];
		for (let i = 0; i < 6; i++) {
			const r = yield* Random.nextBetween(20, 420);
			dots.push(
				yield* Scene.instantiate(Shapes.Circle, {
					x: r,
					y: 40 + i * 40,
					radius: 6,
				}),
			);
		}
		yield* Scene.stagger(
			dots.map((d) => d.pipe(Motion.moveTo({ y: 260 }, "400 millis"))),
			Schedule.spaced("80 millis"),
		);
	}, comp),
};

describe("determinism baseline", () => {
	it("captures or verifies semantic frame values", async () => {
		const captured: Record<string, unknown> = {};
		for (const [name, scene] of Object.entries(scenes)) {
			const collected = await Effect.runPromise(
				Scene.stream(scene as never).pipe(
					Stream.runCollect,
				) as unknown as Effect.Effect<Iterable<unknown>, never, never>,
			);
			const frames = [...collected];
			captured[name] = { frameCount: frames.length, frames: capture(frames) };
		}

		// Compare the SERIALIZED form on both sides. Comparing the in-memory
		// object against parsed JSON fails spuriously: `-0` round-trips to `0`
		// and undefined-valued keys vanish, so vitest reports a mismatch with
		// "no visual difference".
		const serialized = `${JSON.stringify(captured, null, "\t")}\n`;

		if (!existsSync(OUT)) {
			mkdirSync(dirname(OUT), { recursive: true });
			writeFileSync(OUT, serialized);
			// first run records the baseline; nothing to compare against yet
			expect(existsSync(OUT)).toBe(true);
			return;
		}

		expect(JSON.parse(serialized)).toEqual(
			JSON.parse(readFileSync(OUT, "utf8")),
		);
	});
});
