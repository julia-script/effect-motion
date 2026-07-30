import { Schedule } from "effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// The integral, before the limit: rectangles sampled under a curve, each
// one's height read straight off the function. The stagger is the point —
// watching the sum assemble bar by bar is what makes the idea land.

const X0 = -760;
const X1 = 760;
const BASE = -320; // the x-axis of the plot
const H = 560; // arch height
const N = 28; // rectangles
const SAMPLES = 160;

// a smooth arch over [0, 1]
const f = (u: number) => H * Math.sin(u * Math.PI);
const px = (u: number) => X0 + u * (X1 - X0);

const noFill = Color.rgba(0, 0, 0, 0);

export const scene = Scene.make(
	"riemann rectangles",
	function* () {
		yield* Scene.instantiate("Line", {
			position: Entity.vec3({ x: X0 - 40, y: BASE }),
			end: Entity.vec3({ x: X1 - X0 + 80 }),
			strokeColor: Color.hex("#3d4266"),
			strokeWidth: 3,
		});

		// draw the curve on first
		const curve = yield* Scene.instantiate("Path", {
			fillColor: noFill,
			strokeColor: Color.hex("#7f5af0"),
			strokeWidth: 6,
			commands: [{ _tag: "M", x: px(0), y: BASE }],
		});
		yield* curve.pipe(
			Motion.drive("2 seconds", "easeInOutCubic", (t, data) => {
				const n = Math.max(1, Math.ceil(t * SAMPLES));
				return {
					...data,
					commands: [
						{ _tag: "M" as const, x: px(0), y: BASE },
						...Array.from({ length: n }, (_, i) => {
							const u = (t * (i + 1)) / n;
							return { _tag: "L" as const, x: px(u), y: BASE + f(u) };
						}),
					],
				};
			}),
		);

		// one rectangle per sample, growing up from the baseline: height and
		// center-y rise together, so the bar grows from its base
		const w = (X1 - X0) / N;
		const grows = [];
		for (let i = 0; i < N; i++) {
			const u = (i + 0.5) / N;
			const h = f(u);
			const rect = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: px(u), y: BASE }),
				width: w - 6,
				height: 0,
				fillColor: Color.rgba(44, 182, 125, 0.35),
				strokeColor: Color.hex("#2cb67d"),
				strokeWidth: 2,
			});
			grows.push(
				rect.pipe(
					Motion.drive("600 millis", "easeOutCubic", (t, data) => ({
						...data,
						height: h * t,
						position: Entity.vec3({ x: px(u), y: BASE + (h * t) / 2 }),
					})),
				),
			);
		}
		yield* Scene.stagger(grows, Schedule.spaced("60 millis"));

		const caption = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ y: -460 }),
			text: "area under the curve = the sum, as the bars thin",
			fontSize: 44,
			fillColor: Color.hex("#94a3b8"),
			textAnchor: "middle",
			opacity: 0,
		});
		yield* caption.pipe(Motion.fadeTo(1, "600 millis"));
		yield* Motion.wait("1200 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
