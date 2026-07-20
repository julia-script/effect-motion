// The only place frames meet three: the retained frame renderer consuming
// effect-motion's frame stream through the bindings-only @effect-motion/three
// wrapper. Browser-safe surface; the Node adapter (Dawn + readback) arrives
// via a dedicated subpath so node-only code never reaches a browser bundle.
export * as EntityRenderer from "./EntityRenderer.js";
export * as Renderer from "./Renderer.js";
export { builtinRenderers } from "./shapes.js";
