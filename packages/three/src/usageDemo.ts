import { Effect } from "effect";
import { Mesh, PerspectiveCamera } from "three/webgpu";
import * as Renderer from "./Renderer.js";
import * as RenderTarget from "./RenderTarget.js";
import * as Scene from "./Scene.js";

/**
 * A worked example of this package's conventions, kept compiling so it
 * cannot drift.
 *
 * @remarks
 * Demonstrates the three rules the wrapper is built on: scoped
 * construction that cleans itself up, synchronous chaining for mutation
 * that cannot fail, and Effects only where a call is fallible or async.
 *
 * Internal — a reference to read, not part of the public surface. It is
 * written for the browser and kept compiling rather than kept running:
 * executing it in Node fails at renderer init, since it takes no canvas or
 * device. See `@effect-motion/three/node` for the headless equivalent.
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
