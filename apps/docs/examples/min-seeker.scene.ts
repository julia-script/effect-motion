import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// Gradient descent as a picture: a ball rolls along a curve, overshoots the
// minimum, and settles into it. The path is constrained (y is always f(x)),
// so the springiness comes from an elastic easing on the driven parameter —
// the sanctioned way to get bounce on coupled fields.

const X0 = -820;
const X1 = 820;
const SAMPLES = 160;

// an asymmetric bowl with its minimum off-center
const MIN_X = 210;
const f = (x: number) => {
	const u = (x - MIN_X) / 800; // wide enough that the rim stays in frame
	return -300 + 420 * u * u;
};

const noFill = Color.rgba(0, 0, 0, 0);
type Move = { _tag: "M"; x: number; y: number };
type LineTo = { _tag: "L"; x: number; y: number };

export const scene = Scene.make(
	"minimum seeker",
	function* () {
		// the bowl
		const commands: [Move, ...LineTo[]] = [
			{ _tag: "M", x: X0, y: f(X0) },
			...Array.from({ length: SAMPLES }, (_, i): LineTo => {
				const x = X0 + ((i + 1) / SAMPLES) * (X1 - X0);
				return { _tag: "L", x, y: f(x) };
			}),
		];
		yield* Scene.instantiate("Path", {
			fillColor: noFill,
			strokeColor: Color.hex("#7f5af0"),
			strokeWidth: 6,
			commands,
		});

		// the minimum, marked before anyone arrives
		yield* Scene.instantiate("Line", {
			position: Entity.vec3({ x: MIN_X, y: f(MIN_X) - 40 }),
			end: Entity.vec3({ y: -120 }),
			strokeColor: Color.hex("#3d4266"),
			strokeWidth: 3,
		});
		const label = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ x: MIN_X, y: f(MIN_X) - 230 }),
			text: "argmin f",
			fontSize: 44,
			fillColor: Color.hex("#94a3b8"),
			textAnchor: "middle",
			opacity: 0,
		});

		const ball = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: X0 + 60, y: f(X0 + 60) + 46 }),
			radius: 42,
			fillColor: Color.hex("#ff8906"),
		});

		yield* Motion.wait("400 millis");
		// roll: x eases elastically toward the minimum, y stays ON the curve —
		// the overshoot carries the ball up the far wall and back
		const startX = X0 + 60;
		yield* ball.pipe(
			Motion.drive("3 seconds", "easeOutElastic", (t, data) => {
				const x = startX + (MIN_X - startX) * t;
				return { ...data, position: Entity.vec3({ x, y: f(x) + 46 }) };
			}),
		);
		yield* label.pipe(Motion.fadeTo(1, "500 millis"));
		yield* Motion.wait("1 second");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
