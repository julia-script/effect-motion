import { Effect, Layer, Schema } from "effect";
import * as Stream from "effect/Stream";
import * as Entity from "./Entity";
import * as Scene from "./Scene";
import * as Svg from "./Svg";

const Circle = Entity.make("2d/Circle", {
	x: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	y: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
});

const Square = Entity.make("2d/Square", {
	x: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	y: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	width: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(100))),
	height: Schema.Number.pipe(
		Schema.withConstructorDefault(Effect.succeed(100)),
	),
});

const scene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Circle, {});
	yield* Scene.instantiate(Square, {});

	yield* Scene.update(circle, (data) => ({ ...data, x: 100, y: 100 }));

	yield* Scene.tick;
	yield* Scene.update(circle, (data) => ({
		...data,
		x: data.x + 10,
		y: data.y + 10,
	}));

	yield* Scene.tick;
	yield* Scene.update(circle, (data) => ({
		...data,
		x: data.x + 10,
		y: data.y + 10,
	}));
});

// One SvgNode renderer per entity, registered with both sinks.
const circleRenderer = Svg.entityRendererLayer(Circle, ({ id, data }) =>
	Effect.succeed({
		tag: "circle",
		props: { id, cx: data.x, cy: data.y, r: 10 },
	}),
);

const squareRenderer = Svg.entityRendererLayer(Square, ({ data }) =>
	Effect.succeed({
		tag: "rect",
		props: { x: data.x, y: data.y, width: data.width, height: data.height },
	}),
);

const movie = Effect.gen(function* () {
	const svgRenderer = yield* Svg.SvgRenderer.Context;
	const frames = yield* Scene.stream(scene).pipe(Stream.runCollect);
	for (const frame of frames) {
		console.log(yield* svgRenderer.render(frame, { width: 500, height: 300 }));
	}
});

const layers = Svg.layer.pipe(
	Layer.provideMerge([circleRenderer, squareRenderer]),
);

Effect.runPromise(movie.pipe(Effect.provide(layers)));
