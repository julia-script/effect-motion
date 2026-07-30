import * as Camera from "effect-motion/Camera";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Runner from "effect-motion/Runner";
import * as Scene from "effect-motion/Scene";

// Ride the graph, then reveal it: the camera tracks a dot travelling a sine
// curve wider than the frame — every frame copies the dot's position into
// the point of interest — and only the pull-back at the end shows how far
// the journey went.

const X0 = -1500;
const X1 = 1500;
const AMP = 300;
const fy = (x: number) => AMP * Math.sin(x / 170);
const SAMPLES = 300;

const noFill = Color.rgba(0, 0, 0, 0);
type Move = { _tag: "M"; x: number; y: number };
type LineTo = { _tag: "L"; x: number; y: number };

export const scene = Scene.make(
	"camera follow graph",
	function* () {
		// the full curve, wider than the frame on purpose
		const commands: [Move, ...LineTo[]] = [
			{ _tag: "M", x: X0, y: fy(X0) },
			...Array.from({ length: SAMPLES }, (_, i): LineTo => {
				const x = X0 + ((i + 1) / SAMPLES) * (X1 - X0);
				return { _tag: "L", x, y: fy(x) };
			}),
		];
		yield* Scene.instantiate("Path", {
			fillColor: noFill,
			strokeColor: Color.hex("#544f80"),
			strokeWidth: 6,
			commands,
		});

		const rider = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: X0, y: fy(X0) }),
			radius: 34,
			fillColor: Color.hex("#ff8906"),
		});

		const camera = yield* Scene.camera;
		// close in on the rider before the journey starts
		yield* camera.pipe(
			Camera.lookAt({ x: X0, y: fy(X0), z: 0 }, "800 millis"),
			Camera.dollyTo(1500, "1200 millis", "easeInOutCubic"),
		);

		// the ride: the dot travels the curve while the camera copies its
		// position into the point of interest, frame by frame
		yield* Scene.all([
			rider.pipe(
				Motion.drive("6 seconds", "easeInOutSine", (t, data) => {
					const x = X0 + (X1 - X0) * t;
					return { ...data, position: Entity.vec3({ x, y: fy(x) }) };
				}),
			),
			camera.pipe(Camera.follow(rider, "6 seconds")),
		]);

		// the reveal: re-aim at the origin and pull back to the resting view
		const rest = Runner.identityCameraView((yield* Scene.comp()).width).z;
		yield* camera.pipe(
			Camera.lookAt({ x: 0, y: 0, z: 0 }, "1 second", "easeInOutCubic"),
			Camera.dollyTo(rest, "1800 millis", "easeInOutCubic"),
		);
		yield* Motion.wait("600 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
