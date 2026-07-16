import type { RendererType } from "@thorvg/webcanvas";
import * as ThorvgWasm from "./ThorvgWasm";

/**
 * Browser ThorVG layer. Only difference from the Node layer is `locateFile`:
 * here the `.wasm` is served from a base URL (bundler asset dir, or an unpkg URL
 * like `https://unpkg.com/@thorvg/webcanvas@1.0.8/dist/`). Same acquire path
 * otherwise (design D1).
 */
export const layer = (
	baseUrl: string,
	renderer: RendererType = "sw",
	fonts?: Record<string, string>,
) =>
	ThorvgWasm.layer({
		renderer,
		locateFile: (file: string) => new URL(file, baseUrl).href,
		...(fonts !== undefined ? { fonts } : {}),
	});
