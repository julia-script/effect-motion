import { Effect, Layer, Schema } from "effect";
import * as Entity from "../src/Entity";
import * as Scene from "../src/Scene";
import * as Svg from "../src/Svg";

const WIDTH = 500;
const HEIGHT = 300;

const Circle = Entity.make("2d/Circle", {
	x: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	y: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
});

const Square = Entity.make("2d/Square", {
	x: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	y: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	size: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(40))),
});

const circleRenderer = Svg.entityRendererLayer(Circle, ({ data }) =>
	Effect.succeed({
		tag: "circle",
		props: { cx: data.x, cy: data.y, r: 14, fill: "#7f5af0" },
	}),
);

const squareRenderer = Svg.entityRendererLayer(Square, ({ data }) =>
	Effect.succeed({
		tag: "rect",
		props: {
			x: data.x,
			y: data.y,
			width: data.size,
			height: data.size,
			fill: "#2cb67d",
		},
	}),
);

// one tick = one display frame: ~6 seconds at 60fps
const scene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Circle, { x: 370, y: 150 });
	const square = yield* Scene.instantiate(Square, { y: 130 });

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

const layers = Svg.layer.pipe(
	Layer.provideMerge([circleRenderer, squareRenderer]),
);

Effect.runPromise(main.pipe(Effect.provide(layers)));
