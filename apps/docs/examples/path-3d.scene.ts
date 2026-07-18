import { Color, Motion, Scene, Shapes } from "effect-motion";

// Path in 3D: commands are M/L/Z points local to the anchor, and every
// point can carry its own z — the renderer projects each point with its
// own perspective, so one path can zig-zag through depth. The closed
// diamond sits flat at z=0; the open circuit trace dives away from the
// camera and back. Moving the path moves its anchor — the commands never
// change.
export const scene = Scene.make(function* () {
	// a flat closed diamond, filled — plain-2D under the resting camera
	yield* Scene.instantiate(Shapes.Path, {
		x: 120,
		y: 160,
		fill: Color.hex("#7f5af0"),
		commands: [
			{ _tag: "M", x: 0, y: -60 },
			{ _tag: "L", x: 50, y: 0 },
			{ _tag: "L", x: 0, y: 60 },
			{ _tag: "L", x: -50, y: 0 },
			{ _tag: "Z" },
		],
	});

	// an open trace whose alternating points recede into depth: the far
	// spans foreshorten toward the vanishing point while the near ones stay
	// full size
	const trace = yield* Scene.instantiate(Shapes.Path, {
		x: 280,
		y: 160,
		fill: Color.rgba(0, 0, 0, 0),
		stroke: Color.hex("#ff8906"),
		strokeWidth: 4,
		commands: [
			{ _tag: "M", x: 0, y: 0 },
			{ _tag: "L", x: 80, y: -40, z: -600 },
			{ _tag: "L", x: 160, y: 0 },
			{ _tag: "L", x: 240, y: -40, z: -1200 },
			{ _tag: "L", x: 320, y: 0 },
		],
	});

	// the whole trace moves as one rigid unit — anchor animates, commands don't
	yield* trace.pipe(Motion.moveTo({ y: 120 }, "1.5 seconds", "easeInOutCubic"));
	yield* trace.pipe(Motion.moveTo({ y: 160 }, "1.5 seconds", "easeInOutCubic"));
});
