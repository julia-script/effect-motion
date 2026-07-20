import { Scene } from "effect-motion";
import { scene as helloWorld } from "./scenes/hello-world";

// The movie: an ordinary scene that sequences the scenes in src/scenes.
// Nothing is special about this file — studio.ts registers it and
// render.ts renders it like any other scene. Add scenes and chain them here.
export const scene = Scene.make(function* () {
	const hello = yield* Scene.play(helloWorld);
	yield* hello.finished;
	// const next = yield* Scene.play(anotherScene);
	// yield* next.finished;
});
