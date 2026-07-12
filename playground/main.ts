import { Effect, Layer } from "effect";
import * as Motion from "../src/Motion";
import * as Phaser from "../src/Phaser";
import * as Physics from "../src/Physics";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";
import * as Timing from "../src/Timing";

const WIDTH = 500;
const HEIGHT = 300;

const scene = Scene.make(function* () {
	// the race: same distance, same duration, different pacing
	const linear = yield* Scene.instantiate(Shapes.Circle, {
		x: 40,
		y: 60,
		radius: 12,
		fill: "#7f5af0",
	});
	const cubic = yield* Scene.instantiate(Shapes.Circle, {
		x: 40,
		y: 120,
		radius: 12,
		fill: "#2cb67d",
	});
	const expo = yield* Scene.instantiate(Shapes.Circle, {
		x: 40,
		y: 180,
		radius: 12,
		fill: "tomato",
	});
	const ball = yield* Scene.instantiate(Shapes.Circle, {
		x: 250,
		y: 40,
		radius: 14,
		fill: "gold",
	});

	yield* Phaser.all([
		Motion.moveTo(linear, { x: 460 }, "2 seconds"),
		Motion.moveTo(cubic, { x: 460 }, "2 seconds", "easeInOutCubic"),
		Motion.moveTo(expo, { x: 460 }, "2 seconds", "easeOutExpo"),
	]);

	// bounce drop, then a springy return via a custom-shaped back curve
	yield* ball.pipe(Motion.moveTo({ y: 260 }, "1.5 seconds", "easeOutBounce"));
	yield* ball.pipe(
		Motion.moveTo({ y: 40 }, "1 second", Timing.createEaseInOutBack(3)),
	);

	// physics: no durations from here on — springs run until they settle
	const plopper = yield* Scene.instantiate(Shapes.Circle, {
		x: 250,
		y: 150,
		radius: 1,
		fill: "#ff8906",
	});
	// plop-in entrance: radius springs up with overshoot
	yield* plopper.pipe(Physics.springTo({ radius: 24 }, "plop"));
	// swing across, then a bouncy return that never quite wants to stop
	yield* plopper.pipe(Physics.springTo({ x: 440 }, "swing"));
	yield* plopper.pipe(Physics.springTo({ x: 60 }, "bounce"));

	// groups: one moveTo on the group carries both children (local coords)
	const duo = yield* Scene.instantiate(Shapes.Group, { x: 60, y: 230 });
	yield* Scene.instantiate(
		Shapes.Circle,
		{ x: 0, y: 0, radius: 10, fill: "#e53170" },
		{ parent: duo },
	);
	yield* Scene.instantiate(
		Shapes.Square,
		{ x: 14, y: -10, size: 20, fill: "#a786df" },
		{ parent: duo },
	);
	yield* duo.pipe(Motion.moveTo({ x: 380 }, "1.5 seconds", "easeInOutCubic"));
	yield* duo.pipe(Physics.springTo({ y: 60 }, "jump"));
});

// rAF when visible; setTimeout fallback because rAF never fires in
// hidden/throttled tabs (the animation would freeze instead of degrade)
const nextDisplayFrame = Effect.callback<void>((resume) => {
	let settled = false;
	const settle = () => {
		if (settled) {
			return;
		}
		settled = true;
		cancelAnimationFrame(rafHandle);
		clearTimeout(timerHandle);
		resume(Effect.void);
	};
	const rafHandle = requestAnimationFrame(settle);
	const timerHandle = setTimeout(settle, 100);
	return Effect.sync(() => {
		settled = true;
		cancelAnimationFrame(rafHandle);
		clearTimeout(timerHandle);
	});
});

const main = Effect.gen(function* () {
	const target = document.getElementById("app");
	if (target === null) {
		return yield* Effect.die(new Error("missing #app element"));
	}
	const renderer = yield* Svg.SvgDomRenderer.Context;
	const running = yield* Scene.run(scene);

	// the externally paced phaser lets the browser's frame clock be the
	// controller: one scene phase per display frame
	while (true) {
		yield* nextDisplayFrame;
		const frame = yield* Scene.step(running);
		if (frame === null) {
			break;
		}
		yield* renderer.render(frame, { target, width: WIDTH, height: HEIGHT });
	}
});

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

Effect.runPromise(main.pipe(Effect.provide(layers)));
