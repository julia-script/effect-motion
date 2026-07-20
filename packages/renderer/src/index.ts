// The only place frames meet three: the retained frame renderer consuming
// effect-motion's frame stream through the bindings-only @effect-motion/three
// wrapper. Browser-safe surface; the Node adapter (Dawn + readback) arrives
// via a dedicated subpath so node-only code never reaches a browser bundle.
// One module per actor, re-exported as namespaces.
export * as Builtins from "./Builtins.js";
export { builtinRegistry, builtinRenderers } from "./Builtins.js";
export * as EntityRenderer from "./EntityRenderer.js";
export * as Images from "./Images.js";
export * as Renderer from "./Renderer.js";
export * as Sync from "./Sync.js";
export * as Text from "./Text.js";
