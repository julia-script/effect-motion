import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as Motion from "../src/Motion";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";
import { render } from "./support/framebuffer";

const collect = async (scene: unknown): Promise<any[]> => [
	...((await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<any>, never, never>,
	)) as Iterable<any>),
];

const lastFrame = (scene: unknown) => collect(scene).then((f) => f.at(-1)!);

// a 100×50 child comp with a red background and one white circle at local (25, 25)
const child = (meta?: Partial<Runner.CompConfig>) =>
	Scene.make(
		function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 25, y: 25, radius: 8 });
			yield* Scene.tick;
		} as never,
		{
			width: 100,
			height: 50,
			backgroundColor: Color.hex("#ff0000"),
			...meta,
		},
	);

describe("scene composition config", () => {
	it("a scene value carries its comp config; annotated copies share it", () => {
		const s = child();
		expect(s.width).toBe(100);
		expect(s.height).toBe(50);
		const annotated = s.annotateMerge(s.annotations);
		expect(annotated.width).toBe(100);
		expect(annotated.backgroundColor).toBe(s.backgroundColor);
	});

	it("a nested comp does not resize the movie", async () => {
		const movie = Scene.make(
			function* () {
				const h = yield* Scene.play(child() as never);
				yield* h.finished;
			} as never,
			{ width: 200, height: 100 },
		);
		const frame = await lastFrame(movie);
		expect(frame.width).toBe(200);
		expect(frame.height).toBe(100);
	});
});

describe("Scene.play mounts a bounded sub-composition", () => {
	it("the mount group carries the child's bounds, centered in the movie", async () => {
		const movie = Scene.make(
			function* () {
				const h = yield* Scene.play(child() as never);
				yield* h.finished;
			} as never,
			{ width: 200, height: 100 },
		);
		const frame = await lastFrame(movie);
		const group: any = Object.entries(frame.instances).find(([id]) =>
			id.includes("Group"),
		)?.[1];
		expect(group.data.width).toBe(100);
		expect(group.data.height).toBe(50);
		expect(group.data.x).toBe(50); // (200 - 100) / 2
		expect(group.data.y).toBe(25); // (100 - 50) / 2
		expect(Color.toHex(group.data.backgroundColor)).toBe("#ff0000");
	});

	it("the child's background paints within its bounds; the outside shows the root's", async () => {
		const movie = Scene.make(
			function* () {
				const h = yield* Scene.play(child() as never);
				yield* h.finished;
			} as never,
			{
				width: 200,
				height: 100,
				backgroundColor: Color.hex("#001122"),
			},
		);
		const r = await render(await lastFrame(movie));
		expect(r.at(100, 50)).toEqual([0xff, 0, 0, 255]); // inside child bounds
		expect(r.at(10, 10)).toEqual([0x00, 0x11, 0x22, 255]); // root bg outside
		// bounds edges: just inside vs just outside
		expect(r.at(52, 50)).toEqual([0xff, 0, 0, 255]);
		expect(r.at(47, 50)).toEqual([0x00, 0x11, 0x22, 255]);
	});

	it("a transparent child background paints nothing", async () => {
		const movie = Scene.make(
			function* () {
				const h = yield* Scene.play(
					child({ backgroundColor: Color.transparent }) as never,
				);
				yield* h.finished;
			} as never,
			{
				width: 200,
				height: 100,
				backgroundColor: Color.hex("#001122"),
			},
		);
		const r = await render(await lastFrame(movie));
		// inside the child's bounds but away from its circle: root bg shows through
		expect(r.at(60, 30)).toEqual([0x00, 0x11, 0x22, 255]);
	});

	it("child content outside its bounds is clipped", async () => {
		const wide = Scene.make(
			function* () {
				// local x 120 is outside the 100-wide comp; local x 25 is inside
				yield* Scene.instantiate(Shapes.Circle, { x: 120, y: 25, radius: 8 });
				yield* Scene.instantiate(Shapes.Circle, { x: 25, y: 25, radius: 8 });
				yield* Scene.tick;
			} as never,
			{ width: 100, height: 50 },
		);
		const movie = Scene.make(
			function* () {
				const h = yield* Scene.play(wide as never);
				yield* h.finished;
			} as never,
			{ width: 200, height: 100 },
		);
		const r = await render(await lastFrame(movie));
		expect(r.isPainted(75, 50)).toBe(true); // inside: 50 + 25
		expect(r.isPainted(170, 50)).toBe(false); // clipped: 50 + 120
	});

	it("a child bigger than the movie shows only the movie's window", async () => {
		const big = Scene.make(
			function* () {
				yield* Scene.instantiate(Shapes.Circle, { x: 200, y: 100, radius: 8 });
				yield* Scene.tick;
			} as never,
			{ width: 400, height: 200 },
		);
		const movie = Scene.make(
			function* () {
				const h = yield* Scene.play(big as never);
				yield* h.finished;
			} as never,
			{ width: 200, height: 100 },
		);
		const frame = await lastFrame(movie);
		expect(frame.width).toBe(200);
		const r = await render(frame);
		// child centered: its (200,100) sits at world (100, 50) — visible
		expect(r.isPainted(100, 50)).toBe(true);
	});

	it("the handle's group drives the whole child: move and fade", async () => {
		const movie = Scene.make(
			function* () {
				const h = yield* Scene.play(child() as never);
				yield* h.group.pipe(
					Motion.moveTo({ x: 0, y: 0 }, "100 millis"),
					Motion.fadeTo(0.5, "100 millis"),
				);
				yield* h.finished;
			} as never,
			{ width: 200, height: 100 },
		);
		const frame = await lastFrame(movie);
		const group: any = Object.entries(frame.instances).find(([id]) =>
			id.includes("Group"),
		)?.[1];
		expect(group.data.x).toBe(0);
		expect(group.data.y).toBe(0);
		expect(group.data.opacity).toBe(0.5);
	});

	it("deep nesting: a played scene playing a scene nests bounds groups", async () => {
		const inner = child();
		const middle = Scene.make(
			function* () {
				const h = yield* Scene.play(inner as never);
				yield* h.finished;
			} as never,
			{ width: 150, height: 80 },
		);
		const movie = Scene.make(
			function* () {
				const h = yield* Scene.play(middle as never);
				yield* h.finished;
			} as never,
			{ width: 200, height: 100 },
		);
		const frame = await lastFrame(movie);
		const groups = Object.entries(frame.instances).filter(([id]) =>
			id.includes("Group"),
		) as Array<[string, any]>;
		expect(groups).toHaveLength(2);
		const outer = groups.find(([, e]) => e.data.width === 150)!;
		const nested = groups.find(([, e]) => e.data.width === 100)!;
		// the inner bounds group is a child of the outer bounds group,
		// centered in ITS comp: (150 - 100) / 2, (80 - 50) / 2
		expect(outer[1].data.children).toContain(nested[0]);
		expect(nested[1].data.x).toBe(25);
		expect(nested[1].data.y).toBe(15);
	});

	it("two parallel plays get independent groups", async () => {
		const movie = Scene.make(
			function* () {
				const a = yield* Scene.play(child() as never);
				const b = yield* Scene.play(child() as never);
				yield* a.group.pipe(Motion.moveTo({ x: 0, y: 0 }, "100 millis"));
				yield* a.finished;
				yield* b.finished;
			} as never,
			{ width: 200, height: 100 },
		);
		const frame = await lastFrame(movie);
		const groups = Object.entries(frame.instances).filter(([id]) =>
			id.includes("Group"),
		) as Array<[string, any]>;
		expect(groups).toHaveLength(2);
		const xs = groups.map(([, e]) => e.data.x).sort((p, q) => p - q);
		expect(xs).toEqual([0, 50]); // one moved, the other still centered
	});
});
