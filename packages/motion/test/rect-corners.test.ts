import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Motion from "../src/Motion";
import type * as Scene from "../src/Scene";
import * as SceneMod from "../src/Scene";
import * as Shapes from "../src/shapes";
import { render } from "./support/framebuffer";

type Entities = typeof Shapes.Rect | typeof Shapes.Group;

const frameWith = (rect: Record<string, unknown>): Scene.Frame<Entities> =>
	({
		instances: {
			r: { data: Shapes.Rect.data.make(rect as never), entity: Shapes.Rect },
			root: {
				data: Shapes.Group.data.make({ children: ["r"] }),
				entity: Shapes.Group,
			},
		},
		root: "root",
		frameRate: 60,
		width: 200,
		height: 200,
		backgroundColor: "#000000",
		camera: Camera.identity(200),
	}) as Scene.Frame<Entities>;

// a 100×100 rect at (50,50); with radius 30 the corner pixel (54,54) is
// outside the arc while edge midpoints and the center stay filled
const base = { x: 50, y: 50, width: 100, height: 100, fill: "#00ff00" };

describe("Rect corner radii", () => {
	it("rounded corners: corner pixels background, edges and center filled", async () => {
		const r = await render(frameWith({ ...base, rx: 30, ry: 30 }));
		expect(r.isPainted(54, 54)).toBe(false); // top-left corner, inside bbox
		expect(r.isPainted(146, 54)).toBe(false); // top-right corner
		expect(r.isPainted(100, 52)).toBe(true); // top edge midpoint
		expect(r.isPainted(52, 100)).toBe(true); // left edge midpoint
		expect(r.isPainted(100, 100)).toBe(true); // center
	});

	it("absent radii render sharp corners, identical to before the props", async () => {
		const r = await render(frameWith(base));
		expect(r.isPainted(51, 51)).toBe(true); // corner filled = sharp
		expect(r.isPainted(146, 146)).toBe(true);
	});

	it("a lone radius applies to both axes (SVG semantics)", async () => {
		const rxOnly = await render(frameWith({ ...base, rx: 30 }));
		const both = await render(frameWith({ ...base, rx: 30, ry: 30 }));
		for (const [x, y] of [
			[54, 54],
			[146, 146],
			[100, 52],
			[100, 100],
		] as const) {
			expect(rxOnly.at(x, y)).toEqual(both.at(x, y));
		}
	});

	it("radii tween like any numeric field", async () => {
		const frames = await Effect.runPromise(
			SceneMod.stream(
				SceneMod.make(function* () {
					const card = yield* SceneMod.instantiate(Shapes.Rect, {
						x: 50,
						y: 50,
						width: 100,
						height: 100,
						rx: 0,
						ry: 0,
					});
					yield* SceneMod.tick;
					yield* Motion.tweenTo(card, { rx: 40, ry: 40 }, "300 millis");
				} as never),
				{ width: 200, height: 200 },
			).pipe(Stream.runCollect) as unknown as Effect.Effect<
				Iterable<Scene.Frame<Entities>>,
				never,
				never
			>,
		).then((chunk) => [...chunk]);
		const radii = frames.map(
			(f) =>
				(
					Object.values(f.instances).find(
						(e) =>
							(e as { entity: { name: string } }).entity.name === "shapes/Rect",
					) as { data: { rx?: number } }
				)?.data.rx,
		);
		expect(radii[0]).toBe(0);
		expect(radii.at(-1)).toBe(40);
		for (let i = 1; i < radii.length; i++) {
			expect(radii[i]!).toBeGreaterThanOrEqual(radii[i - 1]!);
		}
	});
});
