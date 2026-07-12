import { Effect, Layer, Schema } from "effect";
import * as Stream from "effect/Stream";
import * as Entity from "./Entity";
import * as Renderer from "./Renderer";
import * as Scene from "./Scene";

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

const SvgRenderer = Renderer.make<string, { xmlns: string }>()("SvgRenderer", {
	render: (entities) =>
		Effect.gen(function* () {
			let svg = "<svg>";
			for (const { render } of entities) {
				svg += yield* render;
			}
			return `${svg}</svg>`;
		}),
});

const circleRenderer = SvgRenderer.makeEntityRendererLayer(
	Circle,
	({ id, data }) =>
		Effect.succeed(
			`<circle id="${id}" cx="${data.x}" cy="${data.y}" r="10" />`,
		),
);

const squareRenderer = SvgRenderer.makeEntityRendererLayer(Square, ({ data }) =>
	Effect.succeed(
		`<rect x="${data.x}" y="${data.y}" width="${data.width}" height="${data.height}" />`,
	),
);

const movie = Effect.gen(function* () {
	const svgRenderer = yield* SvgRenderer.Context;
	const frames = yield* Scene.stream(scene ).pipe(Stream.runCollect);
	for (const frame of frames) {
		console.log(yield* svgRenderer.render(frame , { xmlns: "http://www.w3.org/2000/svg" }));
	}
});

const layers = SvgRenderer.layer.pipe(
	Layer.provideMerge([circleRenderer, squareRenderer]),
);

Effect.runPromise(movie.pipe(Effect.provide(layers)));
