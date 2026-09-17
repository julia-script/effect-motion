import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

const ink = Color.hex("#e7edf5");
const muted = Color.hex("#9baabe");
const noFill = Color.rgba(0, 0, 0, 0);
const widths = [0.5, 1, 2, 4, 8, 16];

const label = Effect.fnUntraced(function* (
	text: string,
	x: number,
	y: number,
	fontSize = 22,
) {
	yield* Scene.instantiate("Text", {
		text,
		position: Entity.vec3({ x, y }),
		fontSize,
		textAnchor: "middle",
		fillColor: muted,
	});
});

/** A stationary baseline: identical extents and paint, only width changes. */
export const scene = Scene.make(
	"border quality — widths and shapes",
	function* () {
		yield* label("BORDER QUALITY / WIDTHS & SHAPES", 0, 420, 30);
		yield* label("strokeWidth in scene units", 80, 375);
		for (const [row, name] of [
			"Rect",
			"Circle",
			"Ellipse",
			"Closed Path",
			"Diagonal Line",
		].entries()) {
			yield* label(name, -530, 230 - row * 145, 20);
		}

		for (const [column, strokeWidth] of widths.entries()) {
			const x = -350 + column * 175;
			const paint = { fillColor: noFill, strokeColor: ink, strokeWidth };
			yield* label(String(strokeWidth), x, 325, 26);
			yield* Scene.instantiate("Rect", {
				...paint,
				position: Entity.vec3({ x, y: 230 }),
				width: 110,
				height: 74,
			});
			yield* Scene.instantiate("Circle", {
				...paint,
				position: Entity.vec3({ x, y: 85 }),
				radius: 42,
			});
			yield* Scene.instantiate("Ellipse", {
				...paint,
				position: Entity.vec3({ x, y: -60 }),
				radiusX: 58,
				radiusY: 28,
			});
			// Same dimensions as Rect, through the Path renderer. The close
			// seam is at the top-left, where the first M starts.
			yield* Scene.instantiate("Path", {
				...paint,
				position: Entity.vec3({ x, y: -205 }),
				commands: [
					{ _tag: "M", x: -55, y: 37 },
					{ _tag: "L", x: 55, y: 37 },
					{ _tag: "L", x: 55, y: -37 },
					{ _tag: "L", x: -55, y: -37 },
					{ _tag: "Z" },
				],
			});
			yield* Scene.instantiate("Line", {
				position: Entity.vec3({ x, y: -350 }),
				start: Entity.vec3({ x: -55, y: -30 }),
				end: Entity.vec3({ x: 55, y: 30 }),
				strokeColor: ink,
				strokeWidth,
			});
		}
		yield* Motion.wait("2 seconds");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#151b26") },
);
