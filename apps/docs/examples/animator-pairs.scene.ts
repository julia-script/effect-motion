import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// The three animator families on one subject: moveTo animates position from
// wherever it currently is, tweenTo animates any numeric field by name, and
// fadeTo animates opacity. The base form (move, without To) states its own
// origin — the dot teleport-starts each pass from an explicit x.
export const scene = Scene.make(
	"animator pairs",
	function* () {
		const dot = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -600, y: 60 }),
			radius: 50,
			fillColor: Color.hex("#7f5af0"),
		});
		const label = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ y: -200 }),
			text: "moveTo — origin read from the instance",
			fontSize: 44,
			fillColor: Color.hex("#94a3b8"),
			textAnchor: "middle",
			baseline: "middle",
		});

		// To-form: origin is the current value
		yield* dot.pipe(Motion.moveTo({ x: 600 }, "1 second", "easeInOutCubic"));

		yield* Scene.update(label, (d) => ({
			...d,
			text: "move — origin stated explicitly",
		}));
		// base form: from {x: -600} regardless of where the dot is now
		yield* dot.pipe(
			Motion.move({ x: -600 }, { x: 600 }, "1 second", "easeInOutCubic"),
		);

		yield* Scene.update(label, (d) => ({
			...d,
			text: "tweenTo — any numeric field, by name",
		}));
		yield* dot.pipe(
			Motion.tweenTo({ radius: 110 }, "600 millis", "easeOutBack"),
		);
		yield* dot.pipe(
			Motion.tweenTo({ radius: 50 }, "600 millis", "easeInOutCubic"),
		);

		yield* Scene.update(label, (d) => ({ ...d, text: "fadeTo — opacity" }));
		yield* dot.pipe(
			Motion.fadeTo(0.15, "600 millis"),
			Motion.fadeTo(1, "600 millis"),
		);
		yield* Motion.wait("500 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
