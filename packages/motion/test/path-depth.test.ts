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

describe("Path point depth", () => {
	it("a flat path renders at authored coordinates (identity invariant)", async () => {
		// z omitted entirely — the pure-2D authoring shape
		const r = await render(
			frameWith({
				points: [
					{ x: 60, y: 40 },
					{ x: 160, y: 40 },
					{ x: 110, y: 140 },
				],
				closed: true,
				fill: Color.hex("#00ff00"),
			}),
		);
		expect(r.isPainted(110, 73)).toBe(true); // centroid
		expect(r.isPainted(110, 45)).toBe(true); // near the top edge
		expect(r.isPainted(20, 20)).toBe(false); // outside
		expect(r.isPainted(110, 160)).toBe(false); // below the apex
	});

	it("the x/y anchor translates the whole path", async () => {
		const r = await render(
			frameWith({
				x: -50,
				y: 20,
				points: [
					{ x: 60, y: 40 },
					{ x: 160, y: 40 },
					{ x: 110, y: 140 },
				],
				closed: true,
				fill: Color.hex("#00ff00"),
			}),
		);
		expect(r.isPainted(60, 93)).toBe(true); // centroid, shifted (-50, +20)
		expect(r.isPainted(110, 73)).toBe(false); // the unshifted centroid
	});

	it("a receding polyline foreshortens per point toward the viewport center", async () => {
		// same world x/y both ends, far end 4000 deep — only per-point
		// projection can separate these screen points (mirrors the Line case)
		const r = await render(
			frameWith({
				points: [
					{ x: 150, y: 180 },
					{ x: 150, y: 180, z: -4000 },
				],
				stroke: Color.hex("#00ff00"),
				strokeWidth: 4,
			}),
		);
		const farScale = F / (F + 4000);
		const fx = 100 + 50 * farScale;
		const fy = 100 + 80 * farScale;
		expect(r.isPainted(149, 179)).toBe(true); // near end stays put
		expect(
			r.isPainted(Math.round((150 + fx) / 2), Math.round((180 + fy) / 2)),
		).toBe(true); // midpoint of the projected polyline
		expect(r.isPainted(Math.round(fx) + 1, Math.round(fy) + 1)).toBe(true);
		expect(r.isPainted(150, 105)).toBe(false); // an unforeshortened
		// vertical rail would pass here; the projected one is ~40px away
	});

	it("a path fully behind the camera paints nothing", async () => {
		const behind = Camera.identity(200).z + 100;
		const r = await render(
			frameWith({
				points: [
					{ x: 50, y: 50, z: behind },
					{ x: 150, y: 50, z: behind + 200 },
					{ x: 100, y: 150, z: behind + 400 },
				],
				closed: true,
				fill: Color.hex("#00ff00"),
				stroke: Color.hex("#00ff00"),
				strokeWidth: 6,
			}),
		);
		for (const [x, y] of [
			[50, 50],
			[100, 100],
			[150, 50],
		] as const) {
			expect(r.isPainted(x, y)).toBe(false);
		}
	});

	it("a path straddling the camera fills its visible part only", async () => {
		// two vertices on the screen plane, the apex far behind the camera:
		// the near-plane clip keeps the region on the visible side of the
		// base edge instead of folding through the viewport center. The apex
		// points down-frame so the fanned-out fill never covers pixel (0,0),
		// where the test helper samples the background.
		const behind = Camera.identity(200).z + 400;
		const r = await render(
			frameWith({
				points: [
					{ x: 60, y: 100 },
					{ x: 140, y: 100 },
					{ x: 100, y: 180, z: behind },
				],
				closed: true,
				fill: Color.hex("#00ff00"),
			}),
		);
		expect(r.isPainted(100, 101)).toBe(true); // just below the base edge
		expect(r.isPainted(100, 150)).toBe(true); // toward the clipped apex
		expect(r.isPainted(100, 90)).toBe(false); // the invisible side
	});
});
