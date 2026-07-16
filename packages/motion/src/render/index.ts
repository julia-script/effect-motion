/**
 * The single ThorVG-backed renderer for effect-motion.
 *
 * `Renderer.render(frame, canvas, scene, paints)` folds a frame's instance
 * tree onto a shared ThorVG canvas + scene (flatten → project → depth-sort →
 * paint). This module provides the built-in shape paint functions and the two
 * output adapters (Node PNG, browser blit) that wrap `render` with canvas
 * lifecycle + framebuffer read.
 *
 * Text renders through ThorVG: fonts load into the engine at setup (see the
 * ThorVG layer's `fonts` option), fetched by URL, with a default sans. Path is
 * not in `builtinPaints`: ThorVG has no SVG-`d`-string append, so it needs a
 * path parser — its own follow-up. Provide a Path paint function when needed.
 */

export { blitToCanvas, renderToCanvas } from "./browser";
export * from "./color";
// the browser-safe framebuffer path: render to pixels (async), then blit
// (sync). A consumer that needs to guard the blit — e.g. drop a stale frame's
// paint after a newer one is requested — renders then blits in two steps.
export { type Framebuffer, renderFramebuffer } from "./core";
export * from "./paint";
export * as shapes from "./shapes";
export { builtinPaints } from "./shapes";
// The Node output adapters (renderToBuffer/renderToPng) are intentionally NOT
// re-exported here — they pull in node:fs/zlib via @effect-motion/thorvg/node
// and must not enter a browser bundle. Import them from "effect-motion/render-node".
