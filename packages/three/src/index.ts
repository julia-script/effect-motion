/**
 * `@effect-motion/three` — an Effect wrapper over three.js.
 *
 * @remarks
 * Bindings only. This package knows nothing about effect-motion — no
 * frames, no entities, no projection — and exists to give three.js the two
 * things Effect code needs from it: resources that clean themselves up, and
 * failures in a typed channel.
 *
 * The organizing rule is **Effect at the seams, raw three in between**:
 *
 * - **Construction and teardown are Effects.** {@link Renderer.make},
 *   {@link Scene.make}, and {@link RenderTarget.make} are scoped, so a GPU
 *   device, a scene's children, and a render target's memory are released
 *   when the scope closes rather than by hand.
 * - **Anything that can fail or is async is an Effect** — rendering,
 *   readback, shader compilation — typed as {@link ThreeException}.
 * - **Infallible mutation stays synchronous and chains.** Adding objects,
 *   setting a background, resizing: these cannot fail, so wrapping them in
 *   Effects would buy ceremony and nothing else. They return their handle
 *   and compose with `.pipe`.
 *
 * Handles are branded wrappers around the three object, which stays
 * reachable — `ThreeRaw` re-exports three itself for the leaf value types
 * (geometries, materials, `Vector3`) and the per-frame mutation in a hot
 * path. That escape hatch is deliberate: reaching past a wrapper should be
 * a visible, greppable import rather than the path of least resistance.
 *
 * For headless rendering on a real GPU, import
 * `@effect-motion/three/node` — it lives behind its own subpath so
 * Node-only code never reaches a browser bundle.
 *
 * @example
 * Scoped construction, sync chaining, Effects only where GPU work happens.
 * ```typescript
 * import { Renderer, RenderTarget, Scene } from "@effect-motion/three";
 * import { Mesh, PerspectiveCamera } from "three/webgpu";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 * 	const scene = yield* Scene.make();
 * 	const renderer = yield* Renderer.make({ width: 640, height: 360 });
 * 	const target = yield* RenderTarget.make(640, 360);
 *
 * 	scene.pipe(Scene.add([new Mesh()]), Scene.setBackground(null));
 *
 * 	const camera = new PerspectiveCamera(50, 16 / 9, 1, 1000);
 * 	Renderer.setRenderTarget(renderer, target);
 * 	yield* Renderer.render(renderer, scene, camera);
 * 	return yield* Renderer.readRenderTarget(renderer, target, 640, 360);
 * }).pipe(Effect.scoped);
 * ```
 *
 * @packageDocumentation
 */

// Browser-safe, bindings-only surface over three.js: branded handles with
// Effect at the seams (lifecycle, async boundaries, failures), sync
// chaining for infallible mutation. Knows nothing about effect-motion —
// no frames, entities, or projection. The Node entry (Dawn device +
// environment shims) lives at "@effect-motion/three/node" so node-only
// code never reaches a browser bundle.
//
// `ThreeRaw` is the deliberate escape hatch, not the front door: reaching
// past a wrapper (three's leaf value types, the per-frame object mutation
// in the renderer's hot path) is a visible, greppable import rather than
// the path of least resistance. New code should prefer the actors below.

export * as ThreeRaw from "three/webgpu";
export * as Interop from "./Interop.js";
export * as Line2 from "./Line2.js";
export * as Object3D from "./Object3D.js";
export * as PostProcessing from "./PostProcessing.js";
export * as Renderer from "./Renderer.js";
export * as RenderTarget from "./RenderTarget.js";
export * as Scene from "./Scene.js";
export { ThreeException } from "./ThreeException.js";
export * as Tsl from "./Tsl.js";
