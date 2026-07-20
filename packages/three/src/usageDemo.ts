import { Effect } from "effect";
import { Mesh, PerspectiveCamera } from "three/webgpu";
import * as Renderer from "./Renderer.js";
import * as RenderTarget from "./RenderTarget.js";
import * as Scene from "./Scene.js";

/**
 * Shape reference for the wrapper conventions (AGENTS.md): scoped
 * construction, sync chaining for infallible mutation, Effects only where
 * a call can fail or is async. Not part of the package's public surface.
 */
export const program = Effect.gen(function* () {
	// scoped construction: the scene detaches its children on close, the
	// renderer drains and disposes, the target frees its GPU allocation
	const scene = yield* Scene.make();
	const renderer = yield* Renderer.make({ width: 640, height: 360 });
	const target = yield* RenderTarget.make(640, 360);

	// infallible mutation: sync, chains through pipe, allocates no Effect
	scene.pipe(Scene.add([new Mesh()]), Scene.setBackground(null));
	Renderer.setPixelRatio(renderer, 2);

	// GPU work can fail: Effects, typed as ThreeException
	const camera = new PerspectiveCamera(50, 16 / 9, 1, 1000);
	Renderer.setRenderTarget(renderer, target);
	yield* Renderer.render(renderer, scene, camera);
	const pixels = yield* Renderer.readRenderTarget(renderer, target, 640, 360);

	return pixels.byteLength;
}).pipe(Effect.scoped);
