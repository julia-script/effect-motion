// Browser-safe surface: the C-API wrappers, the module service, the browser
// wasm layer, errors. Deliberately does NOT re-export the Node entry
// (ThorvgWasmNode / savePng) or encodePng — those pull in node:fs / node:zlib
// and would poison a browser bundle. Import them from "@effect-motion/thorvg/node".
export * from "./api";
export { ThorvgException } from "./ThorvgException";
export {
	acquirePaint,
	checked,
	checkedPtr,
	DEFAULT_FONT_URL,
	freePaint,
	loadFontsIntoEngine,
	type OwnedPaint,
	Ptr,
	Scratch,
	type ThorvgOptions,
	ThorvgWasm,
	withScratch,
} from "./ThorvgWasm";
export * as ThorvgWasmBrowser from "./ThorvgWasmBrowser";
