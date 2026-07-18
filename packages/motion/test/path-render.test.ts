import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Color from "../src/Color";
import * as P from "../src/Projection";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { render } from "./support/framebuffer";

type Entities = typeof Shapes.Path | typeof Shapes.Group;

// 200×200 frame, resting camera: origin (100,100), focal 200×50/36
const F = P.defaultFocalLength(200);

const frameWith = (path: Record<string, unknown>): Scene.Frame<Entities> =>
	({
		instances: {
			p: { data: Shapes.Path.data.make(path as never), entity: Shapes.Path },
			root: {
				data: Shapes.Group.data.make({ children: ["p"] }),
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

describe("Path command rendering", () => {
	it("a flat closed path fills at authored coordinates (identity invariant)", async () => {
		// closed triangle anchored at (60, 60): vertices (60,60) (140,60) (100,140)
		const r = await render(
			frameWith({
				x: 60,
				y: 60,
				commands: [
					{ _tag: "M", x: 0, y: 0 },
					{ _tag: "L", x: 80, y: 0 },
					{ _tag: "L", x: 40, y: 80 },
					{ _tag: "Z" },
				],
			}),
		);
		expect(r.isPainted(100, 80)).toBe(true); // interior
		expect(r.isPainted(100, 62)).toBe(true); // near the top edge
		expect(r.isPainted(20, 150)).toBe(false); // outside
		expect(r.isPainted(100, 160)).toBe(false); // below the apex
	});

	it("a depth-spanning open path foreshortens per point", async () => {
		// vertical rail: near point at (150, 180), far point same x/y at
		// z=-4000 — its screen point pulls toward the center (100,100)
		const r = await render(
			frameWith({
				x: 150,
				y: 180,
				fill: Color.rgba(0, 0, 0, 0),
				stroke: Color.hex("#00ff00"),
				strokeWidth: 4,
				commands: [
					{ _tag: "M", x: 0, y: 0 },
					{ _tag: "L", x: 0, y: 0, z: -4000 },
				],
			}),
		);
		const farScale = F / (F + 4000);
		const fx = 100 + 50 * farScale;
		const fy = 100 + 80 * farScale;
		expect(r.isPainted(149, 179)).toBe(true); // near end stays put
		expect(
			r.isPainted(Math.round((150 + fx) / 2), Math.round((180 + fy) / 2)),
		).toBe(true); // midpoint of the projected span
		expect(r.isPainted(150, 105)).toBe(false); // an unforeshortened rail
		// would pass here; the projected one converges toward the center
	});

	it("a path straddling the near plane renders only its visible pieces", async () => {
		const behind = Camera.identity(200).z + 200;
		// front span near the left edge, then a dive behind the camera, then
		// back out — the visible front geometry must paint, and nothing paints
		// at the mirror position a folded projection would produce
		const r = await render(
			frameWith({
				x: 0,
				y: 0,
				fill: Color.rgba(0, 0, 0, 0),
				stroke: Color.hex("#00ff00"),
				strokeWidth: 6,
				commands: [
					{ _tag: "M", x: 20, y: 100 },
					{ _tag: "L", x: 90, y: 100 },
					{ _tag: "L", x: 100, y: 100, z: behind },
				],
			}),
		);
		expect(r.isPainted(30, 100)).toBe(true); // front span paints
		expect(r.isPainted(85, 100)).toBe(true);
	});

	it("a path fully behind the camera paints nothing", async () => {
		const behind = Camera.identity(200).z + 100;
		const r = await render(
			frameWith({
				x: 0,
				y: 0,
				commands: [
					{ _tag: "M", x: 50, y: 50, z: behind },
					{ _tag: "L", x: 150, y: 50, z: behind },
					{ _tag: "L", x: 100, y: 150, z: behind },
					{ _tag: "Z" },
				],
			}),
		);
		for (const [x, y] of [
			[100, 80],
			[100, 100],
			[60, 55],
		] as const) {
			expect(r.isPainted(x, y)).toBe(false);
		}
	});

	it("multiple subpaths render independently", async () => {
		// two disjoint closed squares in one path
		const r = await render(
			frameWith({
				x: 0,
				y: 0,
				commands: [
					{ _tag: "M", x: 20, y: 20 },
					{ _tag: "L", x: 60, y: 20 },
					{ _tag: "L", x: 60, y: 60 },
					{ _tag: "L", x: 20, y: 60 },
					{ _tag: "Z" },
					{ _tag: "M", x: 140, y: 140 },
					{ _tag: "L", x: 180, y: 140 },
					{ _tag: "L", x: 180, y: 180 },
					{ _tag: "L", x: 140, y: 180 },
					{ _tag: "Z" },
				],
			}),
		);
		expect(r.isPainted(40, 40)).toBe(true); // first square
		expect(r.isPainted(160, 160)).toBe(true); // second square
		expect(r.isPainted(100, 100)).toBe(false); // the gap between them
	});
});
