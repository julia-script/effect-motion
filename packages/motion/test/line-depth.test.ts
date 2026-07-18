import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Color from "../src/Color";
import * as P from "../src/Projection";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { render } from "./support/framebuffer";

type Entities = typeof Shapes.Line | typeof Shapes.Group;

// 200×200 frame, resting camera: origin (100,100), focal 200×50/36
const F = P.defaultFocalLength(200);

const frameWith = (line: Record<string, unknown>): Scene.Frame<Entities> =>
	({
		instances: {
			l: { data: Shapes.Line.data.make(line as never), entity: Shapes.Line },
			root: {
				data: Shapes.Group.data.make({ children: ["l"] }),
				entity: Shapes.Group,
			},
		},
		root: "root",
		frameRate: 60,
		width: 200,
		height: 200,
		backgroundColor: Color.hex("#000000"),
		camera: Camera.identity(200),
	}) as Scene.Frame<Entities>;

describe("Line endpoint depth (z2)", () => {
	it("flat line renders at authored coordinates (identity invariant)", async () => {
		const r = await render(
			frameWith({
				x: 20,
				y: 100,
				x2: 180,
				y2: 100,
				stroke: Color.hex("#00ff00"),
				strokeWidth: 4,
			}),
		);
		expect(r.isPainted(100, 100)).toBe(true); // on the line
		expect(r.isPainted(21, 100)).toBe(true); // near start
		expect(r.isPainted(179, 100)).toBe(true); // near end
		expect(r.isPainted(100, 110)).toBe(false); // off the line
	});

	it("a receding rail foreshortens per endpoint toward the viewport center", async () => {
		// same world x/y both ends, far end 4000 deep — only per-endpoint
		// projection can separate these screen points
		const r = await render(
			frameWith({
				x: 150,
				y: 180,
				z: 0,
				x2: 150,
				y2: 180,
				z2: -4000,
				stroke: Color.hex("#00ff00"),
				strokeWidth: 4,
			}),
		);
		// far endpoint pulls toward the viewport center (100,100) with
		// scale F/(F+4000): screen ≈ (103.2, 105.2); midpoint ≈ (126.6, 142.6)
		const farScale = F / (F + 4000);
		const fx = 100 + 50 * farScale;
		const fy = 100 + 80 * farScale;
		expect(r.isPainted(149, 179)).toBe(true); // near end stays put
		expect(
			r.isPainted(Math.round((150 + fx) / 2), Math.round((180 + fy) / 2)),
		).toBe(true); // midpoint of the projected segment
		expect(r.isPainted(Math.round(fx) + 1, Math.round(fy) + 1)).toBe(true);
		expect(r.isPainted(150, 105)).toBe(false); // an unforeshortened
		// vertical rail would pass here; the projected one is ~40px away
	});

	it("a line fully behind the camera paints nothing", async () => {
		const behind = Camera.identity(200).z + 100;
		const r = await render(
			frameWith({
				x: 50,
				y: 50,
				z: behind,
				x2: 150,
				y2: 150,
				z2: behind + 400,
				stroke: Color.hex("#00ff00"),
				strokeWidth: 6,
			}),
		);
		for (const [x, y] of [
			[50, 50],
			[100, 100],
			[150, 150],
		] as const) {
			expect(r.isPainted(x, y)).toBe(false);
		}
	});
});

describe("segment viewport clipping", () => {
	it("a line crossing the frame paints identically after clipping", async () => {
		// same world line authored two ways: huge span vs pre-trimmed to the
		// visible run — the clip must make their visible pixels identical
		const huge = await render(
			frameWith({
				x: -10000,
				y: 150,
				x2: 10000,
				y2: 150,
				stroke: Color.hex("#00ff00"),
				strokeWidth: 4,
			}),
		);
		for (const x of [1, 50, 100, 199]) {
			expect(huge.isPainted(x, 150)).toBe(true);
			expect(huge.isPainted(x, 170)).toBe(false);
		}
	});

	it("a fully-offscreen line paints nothing", async () => {
		const r = await render(
			frameWith({
				x: -10000,
				y: 500,
				x2: 10000,
				y2: 500,
				stroke: Color.hex("#00ff00"),
				strokeWidth: 6,
			}),
		);
		for (const [x, y] of [
			[100, 100],
			[100, 199],
			[1, 1],
		] as const) {
			expect(r.isPainted(x, y)).toBe(false);
		}
	});
});
