import { Context, Effect, Random, Schedule } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";

const collectRaw = async (
	scene: unknown,
	settings: Partial<Runner.Settings> = {},
): Promise<any[]> => [
	...((await Effect.runPromise(
		Scene.stream(scene as never, settings).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<any>, never, never>,
	)) as Iterable<any>),
];

// per frame: non-root instances' data, in instantiation order
const dataFrames = (frames: any[]): Array<Array<Record<string, any>>> =>
	frames.map((f) =>
		Object.entries(f.instances)
			.filter(([id]) => id !== f.root)
			.map(([, e]: any) => e.data as Record<string, any>),
	);

const riser = () =>
	Scene.make(function* () {
		const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
		yield* Motion.tween(c, { x: 0 }, { x: 100 }, "0.5 seconds");
	} as never);

describe("Scene.play", () => {
	it("sequential nesting: one continuous stream, B after A", async () => {
		const movie = Scene.make(function* () {
			const a = yield* Scene.play(riser() as never);
			yield* a.finished;
			const b = yield* Scene.play(riser() as never);
			yield* b.finished;
		} as never);
		const frames = dataFrames(await collectRaw(movie));
		const last = frames.at(-1)!;
		expect(last[0]!.x).toBe(100);
		expect(last[1]!.x).toBe(100);
		// B exists only after A finished, and starts from 0 then
		const bBirth = frames.findIndex((f) => f.length === 2);
		expect(bBirth).toBeGreaterThanOrEqual(30);
		expect(frames[bBirth]![0]!.x).toBe(100); // A already done
	});

	it("concurrent nesting: scenes share frames; the movie awaits both", async () => {
		const movie = Scene.make(function* () {
			yield* Scene.play(riser() as never);
			yield* Scene.play(riser() as never);
			// no awaits: the movie body ends here, the scenes drain
		} as never);
		const frames = dataFrames(await collectRaw(movie));
		expect(frames).toHaveLength(31);
		expect(frames[15]![0]!.x).toBeGreaterThan(0);
		expect(frames[15]![1]!.x).toBeGreaterThan(0);
		expect(frames.at(-1)!.every((d) => d.x === 100)).toBe(true);
	});

	it("nested finish targets the inner scene: crossfade", async () => {
		const fadeOut = Scene.make(function* () {
			const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Motion.tween(c, { x: 0 }, { x: 50 }, "0.5 seconds");
			yield* Scene.finish;
			yield* Motion.tweenTo(c, { x: 500 }, "10 seconds"); // tail
		} as never);
		const movie = Scene.make(function* () {
			const a = yield* Scene.play(fadeOut as never);
			yield* a.finished; // inner finish — the movie itself continues
			const b = yield* Scene.play(riser() as never);
			yield* b.finished;
		} as never);
		const frames = dataFrames(await collectRaw(movie));
		// overlap window: B animates while A's tail still moves
		expect(frames[45]![1]!.x).toBeGreaterThan(0);
		expect(frames[45]![1]!.x).toBeLessThan(100);
		expect(frames[45]![0]!.x).toBeGreaterThan(50);
		// A's tail was cut at movie end, far from its 500 target
		expect(frames.at(-1)![0]!.x).toBeLessThan(200);
		expect(frames.at(-1)![1]!.x).toBe(100);
	});

	it("child finalizers run at the child's end, not the movie's", async () => {
		let finalizedAt = -1;
		const child = Scene.make(function* () {
			const runner = yield* Runner.Runner;
			const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Effect.addFinalizer(() =>
				Effect.sync(() => {
					finalizedAt = runner.phaser.snapshotUnsafe().phase;
				}),
			);
			yield* Motion.tween(c, { x: 0 }, { x: 100 }, "0.5 seconds");
		} as never);
		const movie = Scene.make(function* () {
			const h = yield* Scene.play(child as never);
			yield* h.finished;
			yield* Scene.sleep("500 millis"); // movie continues 30 more frames
		} as never);
		await collectRaw(movie);
		expect(finalizedAt).toBeGreaterThanOrEqual(29);
		expect(finalizedAt).toBeLessThanOrEqual(31); // child end, not ~60
	});

	it("seed stability: nested playback equals a standalone run with the movie's seed", async () => {
		const rand = () =>
			Scene.make(function* () {
				const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				for (let i = 0; i < 3; i++) {
					const x = yield* Random.nextBetween(0, 400);
					yield* Motion.moveTo(c, { x }, "100 millis");
				}
			} as never);
		const standalone = dataFrames(
			await collectRaw(rand(), { seed: "stability" }),
		).map((f) => f[0]!.x);
		const movie = Scene.make(function* () {
			const h = yield* Scene.play(rand() as never);
			yield* h.finished;
		} as never);
		const nested = dataFrames(
			await collectRaw(movie, { seed: "stability" }),
		).map((f) => f[0]!.x);
		expect(nested.slice(0, standalone.length)).toEqual(standalone);
	});

	it("per-mount seed override diverges reproducibly", async () => {
		const rand = () =>
			Scene.make(function* () {
				const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				const x = yield* Random.nextBetween(0, 400);
				yield* Motion.moveTo(c, { x }, "100 millis");
			} as never);
		const movie = Scene.make(function* () {
			const a = yield* Scene.play(rand() as never, { seed: "a" });
			yield* a.finished;
			const b = yield* Scene.play(rand() as never, { seed: "b" });
			yield* b.finished;
		} as never);
		const last = dataFrames(await collectRaw(movie)).at(-1)!;
		expect(last[0]!.x).not.toBe(last[1]!.x);
	});

	it("movie-global maxFrames reaches nested scenes", async () => {
		const infinite = Scene.make(function* () {
			const c = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
			yield* Scene.repeat(
				Motion.tween(c, { x: 0 }, { x: 100 }, "100 millis") as never,
				Schedule.forever,
			);
		} as never);
		const movie = Scene.make(function* () {
			const h = yield* Scene.play(infinite as never);
			yield* h.finished;
		} as never);
		await expect(collectRaw(movie, { maxFrames: 10 })).rejects.toThrow(
			/maxFrames/,
		);
	});
});

describe("Scene.play mounting", () => {
	const childOf = (frames: any[], parentId: string): string[] => {
		const last = frames.at(-1)!;
		return (last.instances[parentId]?.data.children ?? []) as string[];
	};

	it("a mounted scene's instances attach under the mount group", async () => {
		const movie = Scene.make(function* () {
			const g = yield* Scene.instantiate(Shapes.Group, { x: 10, y: 0 });
			const h = yield* Scene.play(riser() as never, { parent: g as never });
			yield* h.finished;
		} as never);
		const frames = await collectRaw(movie);
		const groupId = Object.keys(frames.at(-1)!.instances).find((id) =>
			id.includes("Group"),
		)!;
		const circleId = Object.keys(frames.at(-1)!.instances).find((id) =>
			id.includes("Circle"),
		)!;
		expect(childOf(frames, groupId)).toContain(circleId);
		expect(childOf(frames, "root")).not.toContain(circleId);
	});

	it("explicit parent beats the ambient mount", async () => {
		const child = Scene.make(function* () {
			// ambient mount parent applies here…
			const inner = yield* Scene.instantiate(Shapes.Group, { x: 0, y: 0 });
			// …but this instance names its parent explicitly
			const c = yield* Scene.instantiate(
				Shapes.Circle,
				{ x: 0 },
				{ parent: inner as never },
			);
			yield* Motion.tween(c, { x: 0 }, { x: 100 }, "100 millis");
		} as never);
		const movie = Scene.make(function* () {
			const mount = yield* Scene.instantiate(Shapes.Group, { x: 0, y: 0 });
			const h = yield* Scene.play(child as never, { parent: mount as never });
			yield* h.finished;
		} as never);
		const frames = await collectRaw(movie);
		const ids = Object.keys(frames.at(-1)!.instances);
		const mountId = ids.find((id) => id.endsWith("_0"))!; // first group
		const innerId = ids.find((id) => id.includes("Group") && id !== mountId)!;
		const circleId = ids.find((id) => id.includes("Circle"))!;
		expect(childOf(frames, mountId)).toContain(innerId); // ambient
		expect(childOf(frames, innerId)).toContain(circleId); // explicit
	});

	it("one scene value, two independent mounts", async () => {
		const scene = riser();
		const movie = Scene.make(function* () {
			const g1 = yield* Scene.instantiate(Shapes.Group, { x: 0, y: 0 });
			const g2 = yield* Scene.instantiate(Shapes.Group, { x: 0, y: 100 });
			yield* Scene.play(scene as never, { parent: g1 as never });
			yield* Scene.play(scene as never, { parent: g2 as never });
		} as never);
		const frames = await collectRaw(movie);
		const circles = Object.entries(frames.at(-1)!.instances).filter(([id]) =>
			id.includes("Circle"),
		);
		expect(circles).toHaveLength(2);
		for (const [, entry] of circles as any[]) {
			expect(entry.data.x).toBe(100);
		}
	});
});

describe("scene metadata", () => {
	const Label = Context.Reference<string>("test/Label", {
		defaultValue: () => "",
	});

	it("annotate returns a new value; the original is untouched; playback is identical", async () => {
		const scene = riser();
		const annotated = scene.annotate(Label, "hello");
		expect(Context.get(annotated.annotations, Label)).toBe("hello");
		expect(Context.get(scene.annotations, Label)).toBe(""); // default
		const plain = dataFrames(await collectRaw(scene));
		const withMeta = dataFrames(await collectRaw(annotated));
		expect(withMeta).toEqual(plain);
	});
});
