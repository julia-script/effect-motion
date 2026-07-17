// Browser-safe surface: effect-style namespace modules over the ThorVG C-API,
// plus the flat names used in type signatures (the module service, errors,
// pointer/paint types). Deliberately does NOT re-export the Node entry
// (EngineNode / savePng) or encodePng — those pull in node:fs / node:zlib and
// would poison a browser bundle. Import them from "@effect-motion/thorvg/node".
export * as Animation from "./Animation";
export * as Canvas from "./Canvas";
export * as Engine from "./Engine";
export { type ThorvgOptions, ThorvgWasm } from "./Engine";
export * as Font from "./Font";
export * as Gradient from "./Gradient";
export * as Interop from "./Interop";
export { type OwnedPaint, Ptr, Scratch } from "./Interop";
export * as Paint from "./Paint";
export * as Picture from "./Picture";
export * as Scene from "./Scene";
export * as Session from "./Session";
export { RenderSession } from "./Session";
export * as Shape from "./Shape";
export * as Text from "./Text";
export { ThorvgException } from "./ThorvgException";
