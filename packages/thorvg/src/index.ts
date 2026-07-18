// Browser-safe surface: effect-style namespace modules over the ThorVG C-API,
// plus the flat names used in type signatures (the module service, errors,
// pointer/paint types). Deliberately does NOT re-export the Node entry
// (EngineNode / savePng) or encodePng — those pull in node:fs / node:zlib and
// would poison a browser bundle. Import them from "@effect-motion/thorvg/node".
export * as Animation from "./Animation.js";
export * as Canvas from "./Canvas.js";
export * as Engine from "./Engine.js";
export { type ThorvgOptions, ThorvgWasm } from "./Engine.js";
export * as Font from "./Font.js";
export * as Gradient from "./Gradient.js";
export * as Interop from "./Interop.js";
export { type OwnedPaint, Ptr, Scratch } from "./Interop.js";
export * as Paint from "./Paint.js";
export * as Picture from "./Picture.js";
export * as Scene from "./Scene.js";
export * as Session from "./Session.js";
export { RenderSession } from "./Session.js";
export * as Shape from "./Shape.js";
export * as Text from "./Text.js";
export { ThorvgException } from "./ThorvgException.js";
