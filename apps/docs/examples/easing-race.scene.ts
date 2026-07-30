import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// Same distance, same duration — only the pacing differs. Every easing is a
// pure curve over the same frame count, so all four land on the same frame.
const RACERS: ReadonlyArray<{
	label: string;
	easing?: "easeInOutCubic" | "easeOutExpo" | "easeOutBounce";
	color: string;
}> = [
	{ label: "linear", color: "#7f5af0" },
	{ label: "easeInOutCubic", easing: "easeInOutCubic", color: "#2cb67d" },
	{ label: "easeOutExpo", easing: "easeOutExpo", color: "#ff8906" },
	{ label: "easeOutBounce", easing: "easeOutBounce", color: "#e53170" },
];

export const scene = Scene.make(
	"easing race",
	function* () {
		const motions = [];
		for (const [i, racer] of RACERS.entries()) {
			const y = 270 - i * 180;
			yield* Scene.instantiate("Text", {
				position: Entity.vec3({ x: -780, y: y + 80 }),
				text: racer.label,
				fontSize: 36,
				fillColor: Color.hex("#94a3b8"),
			});
			const dot = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: -780, y }),
				radius: 44,
				fillColor: Color.hex(racer.color),
			});
			motions.push(
				racer.easing
					? Motion.moveTo(dot, { x: 780 }, "2 seconds", racer.easing)
					: Motion.moveTo(dot, { x: 780 }, "2 seconds"),
			);
		}

		yield* Scene.all(motions);
		yield* Motion.wait("600 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
