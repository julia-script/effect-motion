import { Schedule } from "effect";
import { Color, Motion, Entities as S, Scene } from "effect-motion";

// Scene.chain runs items one at a time — the schedule is consulted when
// an item ENDS, so items never overlap (Effect's own schedule guarantee)
export const scene = Scene.make(
	function* () {
		const colors = [
			Color.hex("#e53170"),
			Color.hex("#ff8906"),
			Color.hex("#7f5af0"),
		];
		const dots = [];
		for (const [i, fill] of colors.entries()) {
			dots.push(
				yield* Scene.instantiate("Circle", {
					position: S.vec3({ x: 60, y: 75 + i * 75 }),
					radius: 14,
					fillColor: fill,
				}),
			);
		}

		// each starts 300ms after the previous one FINISHES
		yield* Scene.chain(
			dots.map((dot) =>
				Motion.moveTo(dot, { x: 440 }, "800 millis", "easeInOutCubic"),
			),
			Schedule.spaced("300 millis"),
		);
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
