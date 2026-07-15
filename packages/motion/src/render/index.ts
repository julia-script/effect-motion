/**
 * The single ThorVG-backed renderer for effect-motion.
 *
 * `Renderer.render(frame, canvas, scene, paints)` folds a frame's instance
 * tree onto a shared ThorVG canvas + scene (flatten → project → depth-sort →
 * paint). This module provides the built-in shape paint functions and the two
 * output adapters (Node PNG, browser blit) that wrap `render` with canvas
 * lifecycle + framebuffer read.
 *
 * Text and Path are not in `builtinPaints`: ThorVG text needs a font loaded
 * into the engine (no default font ships in the wasm) and path-`d` needs an
 * SVG-path-string parser — both are their own follow-up. Provide a paint
 * function per entity for them when needed.
 */

export { blitToCanvas, renderToCanvas } from "./browser";
export * from "./color";
export * from "./paint";
export * as shapes from "./shapes";
export { builtinPaints } from "./shapes";
// The Node output adapters (renderToBuffer/renderToPng) are intentionally NOT
// re-exported here — they pull in node:fs/zlib via @effect-motion/thorvg/node
// and must not enter a browser bundle. Import them from "effect-motion/render-node".
