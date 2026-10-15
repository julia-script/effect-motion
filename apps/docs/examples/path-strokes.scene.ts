import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

const route: [Entity.PathCommand, ...Array<Entity.PathCommand>] = [
	{ _tag: "M", x: -340, y: -10 },
	{ _tag: "C", x1: -250, y1: 180, x2: -110, y2: -180, x: 0, y: 0 },
	{ _tag: "S", x2: 240, y2: 160, x: 340, y: 0 },
];

export const scene = Scene.make(
	"Distance along a curve",
	function* () {
		yield* Scene.instantiate("Text", {
			text: "DISTANCE ALONG A CURVE",
			position: Entity.vec3({ y: 215 }),
			textAnchor: "middle",
			fontSize: 28,
			fillColor: Color.hex("#e4edf8"),
		});
		yield* Scene.instantiate("Text", {
			text: "The reveal follows length; the dashes stay anchored to the route.",
			position: Entity.vec3({ y: 170 }),
			textAnchor: "middle",
			fontSize: 18,
			fillColor: Color.hex("#93a4bb"),
		});
		yield* Scene.instantiate("Path", {
			commands: route,
			fillColor: Color.transparent,
			strokeColor: Color.hex("#30415b"),
			strokeWidth: 3,
		});
		const ink = yield* Scene.instantiate("Path", {
			commands: route,
			fillColor: Color.transparent,
			strokeColor: Color.hex("#5ce0bf"),
			strokeWidth: 6,
			strokeDasharray: [20, 12],
			trimEnd: 0,
		});
		const ring = yield* Scene.instantiate("Path", {
			position: Entity.vec3({ y: -165 }),
			commands: [
				{ _tag: "M", x: 35, y: 0 },
				{
					_tag: "A",
					rx: 35,
					ry: 35,
					xAxisRotation: 0,
					largeArc: false,
					sweep: true,
					x: -35,
					y: 0,
				},
				{
					_tag: "A",
					rx: 35,
					ry: 35,
					xAxisRotation: 0,
					largeArc: false,
					sweep: true,
					x: 35,
					y: 0,
				},
				{ _tag: "Z" },
			],
			fillColor: Color.transparent,
			strokeColor: Color.hex("#f8c773"),
			strokeWidth: 5,
			trimEnd: 0.25,
		});
		yield* Scene.all([
			Motion.tweenTo(ink, { trimEnd: 1 }, "3 seconds", "linear"),
			Motion.tweenTo(ring, { trimOffset: 1 }, "3 seconds", "linear"),
		]);
		yield* Scene.all([
			Motion.tweenTo(ink, { strokeDashoffset: -64 }, "2 seconds", "linear"),
			Motion.tweenTo(ring, { trimOffset: 2 }, "2 seconds", "linear"),
		]);
		yield* Motion.wait("1 second");
	},
	{ width: 900, height: 540, backgroundColor: Color.hex("#111c2e") },
);
