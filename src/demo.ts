import { inspect } from "node:util";
import { Effect, Fiber, Schema } from "effect";
import * as Stream from "effect/Stream";
import * as Entity from "./Entity";
import * as Scene from "./Scene";

const Circle = Entity.make("2d/Circle", {
	x: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	y: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
});

const scene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Circle, {});
	yield* Scene.update(circle, (data) => ({ ...data, x: 100, y: 100 }));
	console.log("frame 0");

	yield* Scene.tick;
	console.log("frame 1");
	yield* Scene.update(circle, (data) => ({
		...data,
		x: data.x + 10,
		y: data.y + 10,
	}));

	yield* Scene.tick;
	console.log("frame 2");
	yield* Scene.update(circle, (data) => ({
		...data,
		x: data.x + 10,
		y: data.y + 10,
	}));
});

const movie = Effect.gen(function* () {
	const runningScene = yield* Scene.run(scene);
	const frames = yield* Stream.runCollect(Scene.stream(runningScene));
	console.log("frames", inspect(frames, { depth: Infinity, colors: true }));
	yield* Fiber.await(runningScene.fiber);
});

Effect.runPromise(movie);
