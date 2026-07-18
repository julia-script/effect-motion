// Node-only surface: pulls in node:fs / node:zlib, so it must never be reached
// from a browser bundle. Import from "@effect-motion/thorvg/node".
export * as EngineNode from "./EngineNode.js";
export { encodePng } from "./png.js";
