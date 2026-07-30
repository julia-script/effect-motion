import { Schedule } from "effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// Plotting is sampling: a function becomes a Path by evaluating it at N
// points, and "drawing it on" is growing that command list with one driven
// parameter. Axes are two Lines; labels are Text.

const X0 = -760; // plot window, in scene units
const X1 = 760;
const AMP = 280; // wave amplitude
const PERIODS = 2;
const SAMPLES = 200;

// map a sample index to plot space and evaluate both functions there
const px = (u: number) => X0 + u * (X1 - X0);
const fSin = (u: number) => AMP * Math.sin(u * PERIODS * 2 * Math.PI);
const fCos = (u: number) => AMP * Math.cos(u * PERIODS * 2 * Math.PI);

const noFill = Color.rgba(0, 0, 0, 0);

// draw-on: grow the sampled command list as t sweeps 0→1
type Move = { _tag: "M"; x: number; y: number };
type LineTo = { _tag: "L"; x: number; y: number };
const drawOn =
	(f: (u: number) => number) =>
	(t: number): [Move, ...LineTo[]] => {
		const n = Math.max(1, Math.ceil(t * SAMPLES));
		return [
			{ _tag: "M", x: px(0), y: f(0) },
			...Array.from({ length: n }, (_, i): LineTo => {
				const u = (t * (i + 1)) / n;
				return { _tag: "L", x: px(u), y: f(u) };
			}),
		];
	};

export const scene = Scene.make(
	"function plot",
	function* () {
		// axes with quarter-period ticks
		yield* Scene.instantiate("Line", {
			position: Entity.vec3({ x: X0 - 40 }),
			end: Entity.vec3({ x: X1 - X0 + 80 }),
			strokeColor: Color.hex("#3d4266"),
			strokeWidth: 3,
		});
		yield* Scene.instantiate("Line", {
			position: Entity.vec3({ x: X0, y: -AMP - 60 }),
			end: Entity.vec3({ y: 2 * AMP + 120 }),
			strokeColor: Color.hex("#3d4266"),
			strokeWidth: 3,
		});
		for (let k = 1; k <= 4; k++) {
			const x = px(k / 4);
			yield* Scene.instantiate("Line", {
				position: Entity.vec3({ x, y: -14 }),
				end: Entity.vec3({ y: 28 }),
				strokeColor: Color.hex("#3d4266"),
				strokeWidth: 3,
			});
			yield* Scene.instantiate("Text", {
				position: Entity.vec3({ x, y: -64 }),
				text: k % 2 === 0 ? `${k / 2}T` : `${k}T/4`,
				fontSize: 32,
				fillColor: Color.hex("#94a3b8"),
				textAnchor: "middle",
			});
		}

		const sinPath = yield* Scene.instantiate("Path", {
			fillColor: noFill,
			strokeColor: Color.hex("#2cb67d"),
			strokeWidth: 6,
			commands: [{ _tag: "M", x: px(0), y: fSin(0) }],
		});
		const cosPath = yield* Scene.instantiate("Path", {
			fillColor: noFill,
			strokeColor: Color.hex("#ff8906"),
			strokeWidth: 6,
			commands: [{ _tag: "M", x: px(0), y: fCos(0) }],
		});

		// draw sin, then cos starting 600ms later — both still drawing at once
		yield* Scene.stagger(
			[
				sinPath.pipe(
					Motion.drive("3 seconds", "easeInOutCubic", (t, data) => ({
						...data,
						commands: drawOn(fSin)(t),
					})),
				),
				cosPath.pipe(
					Motion.drive("3 seconds", "easeInOutCubic", (t, data) => ({
						...data,
						commands: drawOn(fCos)(t),
					})),
				),
			],
			Schedule.spaced("600 millis"),
		);

		// name them once they're on screen
		const sinLabel = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ x: X1 + 40, y: fSin(1) + 40 }),
			text: "sin",
			fontSize: 48,
			fillColor: Color.hex("#2cb67d"),
			opacity: 0,
		});
		const cosLabel = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ x: X1 + 40, y: fCos(1) - 40 }),
			text: "cos",
			fontSize: 48,
			fillColor: Color.hex("#ff8906"),
			opacity: 0,
		});
		yield* Scene.all([
			Motion.fadeTo(sinLabel, 1, "500 millis"),
			Motion.fadeTo(cosLabel, 1, "500 millis"),
		]);
		yield* Motion.wait("1 second");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
