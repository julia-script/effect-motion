import { Effect, Exit } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Entity from "../src/Entity";
import * as Motion from "../src/Motion";
import * as Physics from "../src/Physics";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";

describe("lens laws on built-ins", () => {
	it("set returns new immutable data; get(set(d, v)) = v", () => {
		const position = Shapes.Circle.traits["~position"];
		const data = Shapes.Circle.data.make({ x: 1, y: 2 });
		const moved = position.set(data, { x: 10, y: 20, z: 5 });
		expect(moved).not.toBe(data);
		expect(data.x).toBe(1); // original untouched
		expect(position.get(moved)).toEqual({ x: 10, y: 20, z: 5 });

		const opacity = Shapes.Circle.traits["~opacity"];
		const faded = opacity.set(data, 0.5);
		expect(data.opacity).toBe(1);
		expect(opacity.get(faded)).toBe(0.5);
	});

	it("Line's position translates both endpoints", () => {
		const position = Shapes.Line.traits["~position"];
		const data = Shapes.Line.data.make({ x: 0, y: 0, x2: 50, y2: 20 });
		const moved = position.set(data, { x: 100, y: 100, z: 0 });
		expect(moved).toMatchObject({ x: 100, y: 100, x2: 150, y2: 120 });
		expect(position.get(moved)).toEqual({ x: 100, y: 100, z: 0 });
	});
});

const runScene = async <A>(
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	extract: (frame: Scene.Frame<any>) => A,
): Promise<A[]> => {
	const scene = Scene.make(make as never);
	const frames = await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map(extract);
};

const firstNonRoot = (frame: Scene.Frame<any>) =>
	Object.entries(frame.instances).find(([id]) => id !== frame.root)![1]
		.data as Record<string, any>;

describe("trait-based helpers", () => {
	it("moveTo on a Line preserves length and direction", async () => {
		const track = await runScene(function* () {
			const line = yield* Scene.instantiate(Shapes.Line, {
				x: 0,
				y: 0,
				x2: 50,
				y2: 20,
			});
			yield* line.pipe(Motion.moveTo({ x: 100, y: 100 }, "500 millis"));
		}, firstNonRoot);
		const last = track.at(-1)!;
		expect(last).toMatchObject({ x: 100, y: 100, x2: 150, y2: 120 });
		// mid-flight too: the span stays (50, 20) every frame
		for (const frame of track) {
			expect(frame.x2 - frame.x).toBeCloseTo(50, 10);
			expect(frame.y2 - frame.y).toBeCloseTo(20, 10);
		}
	});

	it("moveTo partial target holds the other axis", async () => {
		const track = await runScene(function* () {
			const circle = yield* Scene.instantiate(Shapes.Circle, {
				x: 10,
				y: 77,
			});
			yield* Motion.moveTo(circle, { x: 200 }, "500 millis");
		}, firstNonRoot);
		const last = track.at(-1)!;
		expect(last.x).toBe(200);
		expect(last.y).toBe(77);
		for (const frame of track) {
			expect(frame.y).toBe(77);
		}
	});

	it("move takes an explicit origin; fade/fadeTo end exactly", async () => {
		const track = await runScene(function* () {
			const circle = yield* Scene.instantiate(Shapes.Circle, {
				x: 500,
				opacity: 0.35,
			});
			yield* circle.pipe(Motion.move({ x: 0 }, { x: 100 }, "200 millis"));
			yield* circle.pipe(Motion.fadeTo(0.8, "200 millis", "easeInQuad"));
			yield* Motion.fade(circle, 1, 0.25, "200 millis");
		}, firstNonRoot);
		expect(track[0]!.x).toBeLessThan(120); // explicit origin, not 500
		const last = track.at(-1)!;
		expect(last.x).toBe(100);
		expect(last.opacity).toBe(0.25);
		// the fadeTo leg ended exactly on 0.8 before the fade leg started
		const midLeg = track.find((f) => f.opacity === 0.8);
		expect(midLeg).toBeDefined();
	});

	it("moveTo on a group moves the rendered subtree", async () => {
		const track = await runScene(
			function* () {
				const group = yield* Scene.instantiate(Shapes.Group, {
					x: 0,
					y: 0,
					children: [Scene.instantiate(Shapes.Circle, { x: 5, y: 5 })],
				});
				yield* group.pipe(Motion.moveTo({ x: 40 }, "200 millis"));
			},
			(frame) => {
				const entries = Object.values(frame.instances);
				const group = entries.find(
					(e) => e.entity.name === "shapes/Group" && frame.instances.root !== e,
				)!.data as Record<string, any>;
				const circle = entries.find((e) => e.entity.name === "shapes/Circle")!
					.data as Record<string, any>;
				return { groupX: group.x, circleX: circle.x };
			},
		);
		const last = track.at(-1)!;
		expect(last.groupX).toBe(40);
		expect(last.circleX).toBe(5); // local coordinates untouched
	});

	it("missing trait dies naming entity and key", async () => {
		const Bare = Entity.make("test/Bare", {
			x: Shapes.Shape2D.defaultedNumber(0),
			y: Shapes.Shape2D.defaultedNumber(0),
			opacity: Shapes.Shape2D.defaultedNumber(1),
		});
		const scene = Scene.make(function* () {
			const bare = yield* Scene.instantiate(Bare, {});
			// bypass the compile-time guard deliberately
			yield* Motion.moveTo(bare as never, { x: 10 }, "100 millis");
		} as never);
		const exit = await Effect.runPromiseExit(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<unknown, never, never>,
		);
		expect(Exit.isFailure(exit)).toBe(true);
		const message = JSON.stringify(exit, (_key, value) =>
			value instanceof Error ? value.message : value,
		);
		expect(message).toContain("test/Bare");
		expect(message).toContain("~position");
	});
});

describe("animation chaining", () => {
	// this chain only compiles if every animator accepts an Effect of an
	// instance AND returns the instance WITH its traits — either half
	// regressing breaks the build here
	it("raw and trait animators chain directly in pipe", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, {
					x: 0,
					y: 0,
					radius: 5,
				});
				yield* circle.pipe(
					Motion.tweenTo({ radius: 20 }, "100 millis"),
					Motion.moveTo({ x: 50 }, "100 millis"),
					Physics.springTo({ y: 30 }, "smooth"),
					Motion.fadeTo(0.5, "100 millis"),
				);
			},
			(frame) => firstNonRoot(frame),
		);
		const last = track.at(-1)!;
		expect(last.radius).toBe(20);
		expect(last.x).toBe(50);
		expect(last.y).toBe(30);
		expect(last.opacity).toBe(0.5);
	});

	it("flatMap chaining still works", async () => {
		const track = await runScene(
			function* () {
				const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
				yield* circle.pipe(
					Motion.moveTo({ x: 50 }, "100 millis"),
					Effect.flatMap(Motion.fadeTo(0.5, "100 millis")),
				);
			},
			(frame) => firstNonRoot(frame),
		);
		const last = track.at(-1)!;
		expect(last.x).toBe(50);
		expect(last.opacity).toBe(0.5);
	});
});
