/**
 * `@effect-motion/renderer` — draws effect-motion frames with three.js and
 * WebGPU.
 *
 * @remarks
 * The core library produces frames: plain data describing where everything
 * is at one instant. This package turns those frames into pixels, and is the
 * only place the two worlds meet.
 *
 * Rendering is RETAINED, not immediate. A long-lived three scene is kept in
 * step with the frame stream: each frame is diffed against the last, so
 * objects are built once, mutated when their data changes, and disposed when
 * they leave. Playing a scene therefore does not rebuild the scene graph
 * every frame.
 *
 * Two entry points, by environment:
 *
 * - **Browser** — {@link Renderer}, which draws to a canvas. Import from the
 *   package root.
 * - **Node** — `@effect-motion/renderer/node`, which renders headlessly on a
 *   real GPU (Dawn) and reads frames back as PNGs. This is the export path.
 *   It lives behind its own subpath so Node-only code never reaches a
 *   browser bundle.
 *
 * Both are scoped: acquire one in a `Scope` and every GPU resource is
 * released when it closes.
 *
 * Determinism note: the FRAME stream is deterministic, but pixels are not
 * promised to be bit-identical across GPUs and drivers. Two runs of the same
 * scene look the same; they are not guaranteed to hash the same.
 *
 * @example
 * Render one frame to a PNG, headlessly.
 * ```typescript
 * import * as NodeRenderer from "@effect-motion/renderer/node";
 * import { Effect } from "effect";
 *
 * const png = yield* Effect.scoped(
 * 	NodeRenderer.make({ width: 500, height: 300 }).pipe(
 * 		Effect.flatMap((renderer) => NodeRenderer.renderToPng(renderer, frame)),
 * 	),
 * );
 * ```
 *
 * @packageDocumentation
 */

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
