import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as Motion from "../src/Motion";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as S from "../src/schemas";
import { unreachable } from "./support/raise";

const collect = async (scene: unknown): Promise<any[]> => [
	...((await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<any>, never, never>,
	)) as Iterable<any>),
];

const lastFrame = (scene: unknown) =>
	collect(scene).then((f) => f.at(-1) ?? unreachable());

// a 100×50 child comp with a red background and one white circle at local (25, 25)
const child = (meta?: Partial<Runner.CompConfig>) =>
	Scene.make(
		function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 25, y: 25 }),
				radius: 8,
			});
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
	it("a scene value carries its comp config", () => {
		const s = child();
		expect(s.width).toBe(100);
		expect(s.height).toBe(50);
	});

	it("an optional leading name is carried, display-only", async () => {
		const gen = function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 25, y: 25 }),
				radius: 8,
			});
			yield* Scene.tick;
		};
		const unnamed = Scene.make(gen as never, { width: 100, height: 50 });
		const named = Scene.make("The Grand Orbit", gen as never, {
			width: 100,
			height: 50,
		});
		expect(unnamed.name).toBeUndefined();
		expect(named.name).toBe("The Grand Orbit");
		expect(named.width).toBe(100);
		// the name never reaches the runtime: identical frames either way
		const dataOf = (frames: any[]) =>
			frames.map((f) =>
				Object.fromEntries(
					Object.entries(f.instances).map(([id, e]: [string, any]) => [
						id,
						e.data,
					]),
				),
			);
		expect(dataOf(await collect(named))).toEqual(
			dataOf(await collect(unnamed)),
		);
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
		const [groupId, group] = (Object.entries(frame.instances).find(([id]) =>
			id.includes("Group"),
		) ?? unreachable()) as [
			string,
			{ data: { position: { x: number; y: number } } },
		];
		// the mount group is an ordinary group; the child's bounds are
		// DECLARED against its id rather than copied onto it (design D13)
		expect(group.data.position.x).toBe(50); // (200 - 100) / 2
		expect(group.data.position.y).toBe(25); // (100 - 50) / 2
		const bounds = frame.comps[groupId] ?? unreachable();
		expect(bounds.width).toBe(100);
		expect(bounds.height).toBe(50);
		expect(Color.toHex(bounds.backgroundColor)).toBe("#ff0000");
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
		expect(group.data.position.x).toBe(0);
		expect(group.data.position.y).toBe(0);
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
		// comps are identified by the frame's comp registry now, not by a
		// group carrying a width (design D13)
		const outer =
			groups.find(([id]) => frame.comps[id]?.width === 150) ?? unreachable();
		const nested =
			groups.find(([id]) => frame.comps[id]?.width === 100) ?? unreachable();
		// the inner bounds group is a child of the outer bounds group,
		// centered in ITS comp: (150 - 100) / 2, (80 - 50) / 2
		expect(outer[1].data.children).toContain(nested[0]);
		expect(nested[1].data.position.x).toBe(25);
		expect(nested[1].data.position.y).toBe(15);
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
		const xs = groups.map(([, e]) => e.data.position.x).sort((p, q) => p - q);
		expect(xs).toEqual([0, 50]); // one moved, the other still centered
	});
});
