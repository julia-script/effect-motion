// Node-only render entry: the PNG/buffer output adapters. These pull in
// node:fs/zlib through @effect-motion/thorvg/node, so they live behind their
// own subpath ("effect-motion/render-node") and are never reachable from the
// browser-safe barrel. The browser adapter (renderToCanvas) stays in the main
// "effect-motion" export.
export { renderToBuffer, renderToPng } from "./render/node";
