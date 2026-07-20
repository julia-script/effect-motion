// Browser-safe, bindings-only surface: Effect at the seams (lifecycle, async
// boundaries, failures) over three.js, plus the raw `three/webgpu` namespace
// so consumers have one import root. Knows nothing about effect-motion —
// no frames, entities, or projection. The Node entry (Dawn device +
// environment shims) lives at "@effect-motion/three/node" so node-only code
// never reaches a browser bundle.

export * as THREE from "three/webgpu";
export * as Interop from "./Interop.js";
export * as Line2 from "./Line2.js";
export * as PostProcessing from "./PostProcessing.js";
export * as Renderer from "./Renderer.js";
export { ThreeException } from "./ThreeException.js";
export * as Tsl from "./Tsl.js";
