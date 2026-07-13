import { Effect, Layer, Schedule, Stream } from "effect";
import * as Scene from "./Scene";
import * as Shapes from "./shapes";
import * as Motion from "./Motion";
import * as Physics from "./Physics";
import * as Schema from "effect/Schema";
import * as Entity from "./Entity";
import * as Instance from "./Instance";
import { Svg } from ".";
import { shapesLayer } from "./svg";
import { Name } from "effect/unstable/ai/Tool";

// children live in the group's local coordinates: one motion moves them all
export const scene = Scene.make(function* () {
	const duo = yield* Scene.instantiate(Shapes.Group, { x: 70, y: 200 });
	yield* Scene.instantiate(
		Shapes.Circle,
		{ x: 0, y: 0, radius: 14, fill: "#e53170" },
		{ parent: duo },
	);
	yield* Scene.instantiate(
		Shapes.Square,
		{ x: 20, y: -16, size: 28, fill: "#a786df" },
		{ parent: duo },
	);

	const moveA = Motion.moveTo({ x: 380 }, "1.5 seconds", "easeInOutCubic");
	const moveB = Motion.moveTo({ x: 70 }, "1.5 seconds", "easeInOutCubic");
	yield* Motion.wait("1.5 seconds");
	yield* duo.pipe(
		Motion.moveTo({ x: 380 }, "1.5 seconds", "easeInOutCubic"),
		Motion.moveTo({ x: 70 }, "1.5 seconds", "easeInOutCubic"),
		Motion.wait("1.5 seconds"),
		Physics.springTo({ y: 80 }, "jump"),
		Motion.fadeTo(0.15, "1 second"),
	);
});
// const program = Effect.gen(function* () {
// 	const renderer = yield* Svg.SvgRenderer.Context;
// 	const sceneResult = yield* Scene.stream(scene, {

// 	}).pipe(
// 		Stream.runCollect,
// 		Effect.provide(renderer)
// 	)

// 	console.log(sceneResult);
// 	//  renderer.render(scene, {
// 	// 	width: 500,
// 	// 	height: 300,
// 	// });
// }).pipe(Effect.provide(shapesLayer));

// Effect.runPromise(program);

// schedule-driven composition: a background pulse loops for the scene's
// duration while three staggered dots define its actual length
export const staggered = Scene.make(function* () {
	const stage = yield* Scene.instantiate(Shapes.Group, { x: 70, y: 150 });
	yield* Scene.background(
		Scene.repeat(
			stage.pipe(
				Motion.moveTo({ y: 130 }, "500 millis", "easeInOutCubic"),
				Motion.moveTo({ y: 150 }, "500 millis", "easeInOutCubic"),
			),
			Schedule.forever,
		),
	);
	const dot = (x: number) =>
		Effect.gen(function* () {
			const circle = yield* Scene.instantiate(
				Shapes.Circle,
				{ x, y: 0, radius: 10, fill: "#e53170" },
				{ parent: stage },
			);
			yield* Motion.tweenTo(circle, { x: x + 300 }, "1 second", "easeInOutCubic");
		});
	yield* Scene.all([dot(0), dot(25), dot(50)], {
		schedule: Schedule.spaced("250 millis"),
	});
});

const movie = Effect.gen(function* () {
	// const svgRenderer = yield* Svg.SvgRenderer.Context;
	// const frames = yield* Scene.stream(scene).pipe(Stream.runCollect);
	// let n = 0;
	// for (const frame of frames) {
	// 	console.log(`\x1b[36mframe ${n++}\x1b[0m`);
	// 	console.log(yield* svgRenderer.render(frame, { width: 500, height: 300 }));
	// }
	const frames = yield* Scene.stream(staggered).pipe(Stream.runCollect);
	console.log(`staggered scene: ${[...frames].length} frames`);
});

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

Effect.runPromise(movie.pipe(Effect.provide(layers)));
