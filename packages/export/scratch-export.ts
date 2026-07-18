// temp runner: exports the docs scratchpad scene (apps/docs/app/scratchpad/page.tsx)
import { NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Motion from "effect-motion/Motion";
import * as Physics from "effect-motion/Physics";
import * as Scene from "effect-motion/Scene";
import * as Shapes from "effect-motion/Shapes";
import { Video } from "./src/index.ts";

const scene = Scene.make(function* () {
	yield* Scene.instantiate(Shapes.Circle, {
		x: 60,
		y: 150,
		radius: 30,
		fill: Color.tw("red"),
	}).pipe(
		Motion.tweenTo(
			{ x: 800, z: -3000, fill: Color.tw("yellow") },
			"1 second",
			"easeInOutCubic",
		),
		Motion.tweenTo(
			{ x: -400, fill: Color.tw("blue") },
			"1 second",
			"easeInOutCubic",
		),
		Motion.tweenTo(
			{ x: 800, z: 0, fill: Color.tw("green") },
			"1 second",
			"easeInOutCubic",
		),
		Physics.springTo({ x: 220 }, "swing"),
	);
});

const _scene2 = Scene.make(function* () {
	yield* Scene.instantiate(Shapes.Circle, {
		x: 60,
		y: 150,
		radius: 30,
		fill: Color.tw("red"),
	}).pipe(
		Motion.tweenTo(
			{ x: 800, z: -3000, fill: Color.tw("yellow") },
			"1 second",
			"easeInOutCubic",
		),
		Motion.tweenTo(
			{ x: -400, fill: Color.tw("blue") },
			"1 second",
			"easeInOutCubic",
		),
		Motion.tweenTo(
			{ x: 800, z: 0, fill: Color.tw("green") },
			"1 second",
			"easeInOutCubic",
		),
		Physics.springTo({ x: 220 }, "swing"),
	);

	// const camera = yield* Scene.instantiate(Camera.Camera, {
	// 	aperture: 0.6,
	// });
	// yield* Scene.setCamera(camera);

	// for (let i = -10; i < 10; i++) {
	// 	const gridStep = 200;
	// 	yield* Scene.instantiate(Shapes.Line, {
	// 		y: 200,
	// 		y2: 200,
	// 		z: i * gridStep,
	// 		z2: i * gridStep,
	// 		x: -1000,
	// 		x2: 1000,
	// 		opacity: 0.5,
	// 		stroke: Color.rgba(127, 90, 240),
	// 	});
	// 	yield* Scene.instantiate(Shapes.Line, {
	// 		y: 200,
	// 		y2: 200,
	// 		x: i * gridStep,
	// 		x2: i * gridStep,
	// 		z: -2000,
	// 		z2: 2000,
	// 		opacity: 0.5,
	// 		stroke: Color.rgba(127, 90, 240),
	// 	});
	// }

	// yield* Scene.all([
	// 	camera.pipe(
	// 		Motion.tweenTo(
	// 			({ z }) => ({ z: z + 900, rotZ: 0.3, rotX: -0.2, y: -100 }),
	// 			"8 second",
	// 			"easeInOutCubic",
	// 		),
	// 	),
	// 	circle.pipe(
	// 		Motion.tweenTo(
	// 			{ x: 800, z: -3000, fill: Color.tw("red") },
	// 			"1 second",
	// 			"easeInOutCubic",
	// 		),
	// 		Motion.tweenTo(
	// 			{ x: -400, fill: Color.tw("blue") },
	// 			"1 second",
	// 			"easeInOutCubic",
	// 		),
	// 		Motion.tweenTo(
	// 			{ x: 440, z: 0, y: 60, fill: Color.tw("green") },
	// 			"1 second",
	// 			"easeInOutCubic",
	// 		),
	// 		Motion.tweenTo(
	// 			{ x: 60, z: 200, fill: Color.tw("yellow") },
	// 			"1 second",
	// 			"easeInOutCubic",
	// 		),
	// 		Motion.tweenTo(
	// 			{ x: 400, z: 400, y: 150, fill: Color.tw("purple") },
	// 			"1 second",
	// 			"easeInOutCubic",
	// 		),
	// 		Motion.tweenTo(
	// 			{ x: -200, z: 2000, y: 300, fill: Color.tw("orange") },
	// 			"1 second",
	// 			"easeInOutCubic",
	// 		),
	// 	),
	// ]);
});

const out = process.argv[2] ?? "scratchpad.mp4";

// comp size sets the camera's world scale (focal = width×50/36), so a bigger
// comp reframes the shot; dpr supersamples the SAME framing instead.
// Default 500×300@60 comp (the docs player's framing) × 4 → 2000×1200 video.
Video.render(scene, out, { dpr: 4 })
	.pipe(Effect.provide(NodeServices.layer), Effect.runPromise)
	.then(() => console.log(`wrote ${out}`))
	.catch((err: unknown) => {
		console.error(err);
		process.exit(1);
	});
