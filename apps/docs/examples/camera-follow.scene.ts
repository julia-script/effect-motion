import { Schedule } from "effect";
import { Motion, Particles, Scene, Shapes } from "effect-motion";

// The camera follows a traveller across a textured world. The subject stays
// framed near centre while the ground streaks past — so it reads as "moving
// through a world", not "the background is animating". Two cues sell the
// motion: floor marks that slide by, and the subject bobbing as it goes.
export const scene = Scene.make(function* () {
	// ground: a long row of floor marks the camera reveals as it travels.
	// depth 1 (default) so they track the camera fully and streak past.
	const marks = [];
	for (let x = 20; x < 720; x += 40) {
		marks.push(
			Scene.instantiate(Shapes.Rect, {
				x,
				y: 250,
				width: 18,
				height: 4,
				fill: "#544f80",
			}),
		);
	}
	yield* Scene.instantiate(Shapes.Group, { children: marks });

	// a faint dust field drifting along the ground for extra motion detail
	const dust = yield* Particles.field({
		x: 0,
		y: 180,
		region: { w: 720, h: 80 },
		drift: [3, 10],
		size: [0.6, 1.6],
		opacityRange: [0.2, 0.6],
		palette: ["#a7a9be", "#d4d4e0"],
		capacity: 60,
	});
	yield* Scene.background(Particles.simulate(dust, "10 seconds", { fill: 60 }));

	// the traveller: a dot that bobs up and down as it travels (a walk cycle)
	const traveller = yield* Scene.instantiate(Shapes.Circle, {
		x: 100,
		y: 210,
		radius: 18,
		fill: "#ff8906",
	});
	// bob loops for the whole shot — the self-motion that says "this thing is
	// moving", independent of the camera following it
	yield* Scene.background(
		Scene.repeat(
			traveller.pipe(
				Motion.tweenTo({ y: 194 }, "400 millis", "easeInOutSine"),
				Motion.tweenTo({ y: 210 }, "400 millis", "easeInOutSine"),
			),
			Schedule.forever,
		),
	);

	const cam = yield* Scene.camera;
	// the traveller crosses world space; a forked camera pan tracks it so it
	// stays framed near centre while the ground and dust slide past
	yield* Scene.fork(
		cam.pipe(Motion.moveTo({ x: 300 }, "3 seconds", "easeInOutCubic")),
	);
	yield* traveller.pipe(
		Motion.moveTo({ x: 400 }, "3 seconds", "easeInOutCubic"),
	);
});
