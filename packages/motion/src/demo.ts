import { NodeServices } from "@effect/platform-node";
import { Session } from "@effect-motion/thorvg";
import { EngineNode } from "@effect-motion/thorvg/node";
import { Effect, Layer, Schedule, Stream } from "effect";
import * as Color from "./Color.js";
import * as Motion from "./Motion.js";
import * as Physics from "./Physics.js";
import * as PngExporter from "./PngExporter.js";
import * as Renderer from "./Renderer.js";
import * as Scene from "./Scene.js";
import * as Shapes from "./Shapes.js";

// the demo's comp config — the old runner defaults, now explicit on the scene
const demoComp = {
	width: 500,
	height: 300,
	backgroundColor: Color.rgba(22, 22, 29),
};

// children live in the group's local coordinates: one motion moves them all
export const scene = Scene.make(function* () {
	const duo = yield* Scene.instantiate(Shapes.Group, {
		x: 70,
		y: 200,
		children: [
			Scene.instantiate(Shapes.Circle, {
				x: 0,
				y: 0,
				radius: 14,
				fill: Color.hex("#e53170"),
			}),
			Scene.instantiate(Shapes.Square, {
				x: 20,
				y: -16,
				size: 28,
				fill: Color.hex("#a786df"),
			}),
		],
	});

	yield* Motion.wait("1.5 seconds");
	yield* duo.pipe(
		Motion.moveTo({ x: 380 }, "1.5 seconds", "easeInOutCubic"),
		Motion.moveTo({ x: 70 }, "1.5 seconds", "easeInOutCubic"),
		Motion.wait("1.5 seconds"),
		Physics.springTo({ y: 80 }, "jump"),
		Motion.fadeTo(0.15, "1 second"),
	);
}, demoComp);

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
			const circle = yield* Scene.instantiate(Shapes.Circle, {
				x,
				y: 0,
				radius: 10,
				fill: Color.hex("#e53170"),
			});
			// reparent the freshly-born dot from root into the stage group
			yield* Scene.appendChild(stage, circle);
			yield* Motion.tweenTo(
				circle,
				{ x: x + 300 },
				"1 second",
				"easeInOutCubic",
			);
		});
	yield* Scene.stagger(
		[dot(0), dot(25), dot(50)],
		Schedule.spaced("250 millis"),
	);
}, demoComp);

// render the middle frame of the duo scene to a PNG through the single ThorVG
// renderer (Node adapter) — the end-to-end path: Scene.stream → renderToPng.
const movie = Effect.gen(function* () {
	const frames = yield* Scene.stream(scene).pipe(Stream.runCollect);

	const list = [...frames];
	const mid = list[Math.floor(list.length / 2)] as Scene.Frame;
	const framebuffer = yield* Renderer.render(mid);

	const _png = yield* PngExporter.toBuffer(framebuffer);
	yield* PngExporter.toFile(framebuffer, "output.png");
});

Effect.runPromise(
	movie.pipe(
		Effect.scoped,
		Effect.provide(
			Layer.provideMerge(
				// a demo scene with declared assets would add fonts/images maps here
				Session.layer({ width: 500, height: 300 }),
				EngineNode.layer("sw"),
			),
		),
		Effect.provide(NodeServices.layer),
	),
);
