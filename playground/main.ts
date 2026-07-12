import { Effect, Layer } from "effect";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

const WIDTH = 500;
const HEIGHT = 300;

const scene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Shapes.Circle, {
		x: 370,
		y: 150,
		radius: 14,
		fill: "#7f5af0",
	});
	const square = yield* Scene.instantiate(Shapes.Square, {
		x: 30,
		y: 130,
		size: 40,
		fill: "#2cb67d",
	});

	// moveTo: from current data — data-last, pipeable form
	yield* circle.pipe(Motion.moveTo({ x: 130, y: 150 }, "2 seconds"));

	// moveTo: data-first form with an updater target
	yield* Motion.moveTo(square, (data) => ({ x: data.x + 380 }), "2 seconds");

	// move: explicit start — snaps to `from`, then interpolates to `to`
	yield* Motion.move(circle, { x: 370, y: 50 }, { x: 130, y: 50 }, "2 seconds");

	// move works on any numeric prop: a fade with an explicit start
	yield* circle.pipe(Motion.move({ opacity: 1 }, { opacity: 0.2 }, "1 second"));
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
