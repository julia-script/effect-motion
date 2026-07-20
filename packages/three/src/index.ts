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
