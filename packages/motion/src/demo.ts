import { Effect, Stream } from "effect";
import * as Entity from "./Entity.js";
import * as Font from "./Font.js";
import * as PngExporter from "./PngExporter.js";
import * as Renderer from "./Renderer.js";
import * as Scene from "./Scene.js";

// local copy: the test-support helper lives outside the build rootDir
const unreachable = (): never => {
	throw new Error("unreachable");
};

const RobotoFont = Font.Font("Roboto");
const DummyEntity = Entity.make("DummyEntity", {
	fontFamily: Font.schema,
});

export const scene = Scene.make(function* () {
	const font = yield* RobotoFont;
	const _demoEntity = yield* Scene.instantiate(DummyEntity, {
		fontFamily: font,
	});
});
// // render the middle frame of the duo scene to a PNG through the single ThorVG
// // renderer (Node adapter) — the end-to-end path: Scene.stream → renderToPng.
const _movie = Effect.gen(function* () {
	const _demo = yield* Scene.run(scene);
	const frames = yield* Scene.stream(scene).pipe(Stream.runCollect);

	const list = [...frames];
	const mid = list[Math.floor(list.length / 2)] ?? unreachable();
	const framebuffer = yield* Renderer.render(mid);

	const _png = yield* PngExporter.toBuffer(framebuffer);
	yield* PngExporter.toFile(framebuffer, "output.png");
});

// Effect.runPromise(
// 	movie.pipe(
// 		Effect.scoped,
// 		Effect.provide(
// 			Layer.provideMerge(
// 				// a demo scene with declared assets would add fonts/images maps here
// 				Session.layer({ width: 500, height: 300 }),
// 				EngineNode.layer("sw"),
// 			),
// 		),
// 		Effect.provide(NodeServices.layer),
// 	),
// );
