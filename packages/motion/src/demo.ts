import { Effect, Layer } from "effect";
import * as Stream from "effect/Stream";
import * as Scene from "./Scene";
import * as Shapes from "./shapes";
import * as Svg from "./svg";

const scene = Scene.make(function* () {
	// defaults only: visible black circle at the origin
	const plain = yield* Scene.instantiate(Shapes.Circle, {});

	// full styling: fill + stroke + opacity
	const styled = yield* Scene.instantiate(Shapes.Circle, {
		x: 100,
		y: 100,
		radius: 30,
		fill: "#7f5af0",
		stroke: "#2cb67d",
		strokeWidth: 4,
		opacity: 0.8,
	});

	const rect = yield* Scene.instantiate(Shapes.Rect, {
		x: 200,
		y: 40,
		width: 120,
		height: 60,
		fill: "tomato",
	});

	const square = yield* Scene.instantiate(Shapes.Square, {
		x: 200,
		y: 150,
		size: 60,
		fill: "none",
		stroke: "black",
		strokeWidth: 2,
	});

	yield* Scene.instantiate(Shapes.Ellipse, {
		x: 420,
		y: 80,
		rx: 50,
		ry: 25,
		fill: "gold",
	});

	// line: no fill, visible by default (stroke black, width 1)
	const line = yield* Scene.instantiate(Shapes.Line, {
		x: 20,
		y: 250,
		x2: 480,
		y2: 250,
	});

	// path: raw svg path data; x/y translate the whole path
	const arrow = yield* Scene.instantiate(Shapes.Path, {
		d: "M 0 0 L 40 20 L 0 40 Z",
		x: 380,
		y: 180,
		fill: "steelblue",
	});

	yield* Scene.tick;

	// animate across a frame: move, fade, thicken
	yield* Scene.update(plain, (data) => ({ ...data, x: 40, y: 40 }));
	yield* Scene.update(styled, (data) => ({ ...data, opacity: 0.4 }));
	yield* Scene.update(rect, (data) => ({ ...data, x: data.x + 30 }));
	yield* Scene.update(line, (data) => ({ ...data, strokeWidth: 3 }));

	yield* Scene.tick;

	yield* Scene.update(square, (data) => ({ ...data, size: 80 }));
	yield* Scene.update(styled, (data) => ({ ...data, opacity: 1 }));
	yield* Scene.update(arrow, (data) => ({ ...data, x: data.x + 40 }));
});

const movie = Effect.gen(function* () {
	const svgRenderer = yield* Svg.SvgRenderer.Context;
	const frames = yield* Scene.stream(scene).pipe(Stream.runCollect);
	let n = 0;
	for (const frame of frames) {
		console.log(`\x1b[36mframe ${n++}\x1b[0m`);
		console.log(yield* svgRenderer.render(frame, { width: 500, height: 300 }));
	}
});

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

Effect.runPromise(movie.pipe(Effect.provide(layers)));
