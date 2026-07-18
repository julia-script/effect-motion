import { Schedule } from "effect";
import { Camera, Color, Motion, Physics, Scene, Shapes } from "effect-motion";

// The Effect logo rebuilt as a scene instead of traced from the SVG: the
// mark really is three square plates lying flat in the ground plane
// (rotX π/2 lays each flat, rotY π/4 turns it into a diamond), stacked in
// world y. A camera panned up and pitched down supplies the isometric
// look — the 2:1 foreshortening is the projection, not drawn geometry.

const SIZE = 110; // plate edge in world units
const CENTER_X = 250;
const CENTER_Y = 112; // stack midpoint in world y
const SPACING = 30; // vertical gap between plates
const HALF = SIZE / Math.SQRT2; // pivot corner → diamond center offset
const PITCH = -0.55; // camera pitch (radians); sin ≈ 0.52 ≈ 2:1 diamonds

export const scene = Scene.make(function* () {
	// the plate pivot is its west corner, so shift x back by the
	// half-diagonal to center each diamond on CENTER_X. All plates park
	// above the frame and spring down into the stack.
	const plate = (style: {
		fill: Color.Color;
		stroke?: Color.Color;
		strokeWidth?: number;
	}) =>
		Scene.instantiate(Shapes.Rect, {
			x: CENTER_X - HALF,
			y: CENTER_Y - 340,
			width: SIZE,
			height: SIZE,
			rotX: Math.PI / 2,
			rotY: Math.PI / 4,
			...style,
		});
	const outline = {
		fill: Color.hex("transparent"),
		stroke: Color.hex("white"),
		strokeWidth: 3,
	};
	const layers = [
		{ y: CENTER_Y + SPACING, plate: yield* plate(outline) }, // bottom
		{ y: CENTER_Y, plate: yield* plate(outline) }, // middle
		{
			y: CENTER_Y - SPACING,
			plate: yield* plate({ fill: Color.hex("white") }),
		}, // top
	];

	// look at the stack from above: pitch the camera down, and pan it up so
	// the optical axis still passes through the stack (y = z·tan(pitch))
	const cam = yield* Scene.camera;
	const restZ = Camera.identity((yield* Scene.settings()).width).z;
	yield* Scene.update(cam, (d) => ({
		...d,
		rotX: PITCH,
		y: restZ * Math.tan(PITCH),
	}));

	// the stack assembles bottom-up, each plate landing with a little give
	yield* Scene.stagger(
		layers.map(({ y, plate }) => Physics.springTo(plate, { y }, "plop")),
		Schedule.spaced("180 millis"),
	);

	// the wordmark rides the HUD: screen-space, immune to the camera
	const wordmark = yield* Scene.instantiate(Shapes.Text, {
		text: "effect",
		x: 250,
		y: 226,
		fontSize: 42,
		fill: Color.hex("white"),
		textAnchor: "middle",
		baseline: "middle",
		opacity: 0,
	});
	const hud = yield* Scene.instantiate(Shapes.Hud, {
		y: 14,
		children: [wordmark],
	});
	yield* Scene.all([
		wordmark.pipe(Motion.fadeTo(1, "600 millis")),
		hud.pipe(Motion.tweenTo({ y: 0 }, "600 millis", "easeOutCubic")),
	]);

	// one settling breath through the stack, top to bottom
	yield* Scene.stagger(
		[...layers]
			.reverse()
			.map(({ y, plate }) =>
				plate.pipe(
					Motion.moveTo({ y: y - 10 }, "280 millis", "easeInOutCubic"),
					Motion.moveTo({ y }, "280 millis", "easeInOutCubic"),
				),
			),
		Schedule.spaced("140 millis"),
	);
	yield* Motion.wait("1 second");
});
