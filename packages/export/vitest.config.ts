import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tests run against workspace source, not dist — no build required. The
// PngExporter subpath needs its own alias (a bare "effect-motion" alias to the
// index file would resolve "effect-motion/PngExporter" to "index.ts/PngExporter").
export default defineConfig({
	resolve: {
		alias: {
			"effect-motion/PngExporter": fileURLToPath(
				new URL("../motion/src/PngExporter.ts", import.meta.url),
			),
			"effect-motion": fileURLToPath(
				new URL("../motion/src/index.ts", import.meta.url),
			),
		},
	},
});
