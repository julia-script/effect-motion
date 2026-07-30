import { Effect, Schedule } from "effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// One choreography, three combinators: a background pulse runs for the whole
// scene (interrupted at the end), five bars enter on a stagger (starts
// spaced, runs overlapping), then leave on a chain (strictly one at a time).
export const scene = Scene.make(
	"composition",
	function* () {
		const pulse = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ y: 330 }),
			radius: 30,
			fillColor: Color.hex("#2cb67d"),
		});
		yield* Scene.background(
			Scene.repeat(
				pulse.pipe(
					Motion.tweenTo({ radius: 60 }, "500 millis", "easeInOutSine"),
					Motion.tweenTo({ radius: 30 }, "500 millis", "easeInOutSine"),
				),
				Schedule.forever,
			),
		);

		const colors = ["#e53170", "#ff8906", "#7f5af0", "#2cb67d", "#94a3b8"];
		const bars = [];
		for (const [i, hex] of colors.entries()) {
			bars.push(
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({ x: -520 + i * 260, y: -700 }),
					width: 160,
					height: 320,
					fillColor: Color.hex(hex),
				}),
			);
		}

		// stagger: each start 150ms after the previous START; all run at once
		yield* Scene.stagger(
			bars.map((bar) =>
				Motion.moveTo(bar, { y: -60 }, "700 millis", "easeOutBack"),
			),
			Schedule.spaced("150 millis"),
		);
		yield* Motion.wait("400 millis");

		// chain: each starts only after the previous one ENDS — never overlaps
		yield* Scene.chain(
			bars.map((bar) =>
				Motion.moveTo(bar, { y: 700 }, "400 millis", "easeInCubic"),
			),
		);

		// fork: spawn concurrent work; the scene's end WAITS for forks
		yield* Scene.fork(
			Effect.gen(function* () {
				const dot = yield* Scene.instantiate("Circle", {
					position: Entity.vec3({ x: -820, y: -60 }),
					radius: 44,
					fillColor: Color.hex("#fffffe"),
				});
				yield* dot.pipe(
					Motion.moveTo({ x: 820 }, "1200 millis", "easeInOutCubic"),
					Motion.fadeTo(0, "300 millis"),
				);
			}),
		);
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
