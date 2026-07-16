import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RendererType } from "@thorvg/webcanvas";
import { Effect } from "effect";
import type { Canvas } from "./api";
import { render } from "./api";
import { encodePng } from "./png";
import * as ThorvgWasm from "./ThorvgWasm";
import { wrapPromise } from "./ThorvgWasm";

/**
 * Node ThorVG layer. Only difference from the browser layer is `locateFile`:
 * here the `.wasm` is resolved next to the installed `@thorvg/webcanvas` package
 * (design D1).
 */
export const layer = (
	renderer: RendererType = "sw",
	fonts?: Record<string, string>,
) => {
	const wasmDir = path.resolve(
		fileURLToPath(import.meta.resolve("@thorvg/webcanvas")),
		"..",
	);
	return ThorvgWasm.layer({
		renderer,
		locateFile: (file: string) => path.resolve(wasmDir, file),
		...(fonts !== undefined ? { fonts } : {}),
	});
};

/**
 * Encode the canvas's current framebuffer as a PNG and write it to `filePath`.
 * Expects the canvas to have already been drawn/synced (call `draw` + `sync`
 * first). Reads the size from the canvas, so it stays correct after `resize`.
 */
export const savePng = (canvas: Canvas, filePath: string) =>
	Effect.gen(function* () {
		const buffer = yield* render(canvas);
		const { width, height } = canvas.instance.size();
		const png = encodePng(new Uint8Array(buffer), width, height);
		yield* wrapPromise(() => writeFile(filePath, png));
	});
