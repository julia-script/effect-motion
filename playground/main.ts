import { Effect, Layer } from "effect";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

const WIDTH = 500;
const HEIGHT = 300;

// one tick = one display frame: ~6 seconds at 60fps
const scene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Shapes.Circle, {
		x: 370,
		y: 150,
		radius: 14,
		fill: "#7f5af0",
	});
	const square = yield* Scene.instantiate(Shapes.Square, {
		y: 130,
		size: 40,
		fill: "#2cb67d",
	});

	for (let i = 0; i < 360; i++) {
		const t = (i / 180) * Math.PI;
		yield* Scene.update(circle, (data) => ({
			...data,
			x: 250 + Math.cos(t) * 120,
			y: 150 + Math.sin(t) * 80,
		}));
		yield* Scene.update(square, (data) => ({
			...data,
			x: 30 + Math.abs(((i * 2) % 800) - 400),
		}));
		yield* Scene.tick;
	}
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
