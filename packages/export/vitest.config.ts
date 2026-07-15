import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tests run against workspace source, not dist — no build required. The
// render-node subpath needs its own alias (a bare "effect-motion" alias to the
// index file would resolve "effect-motion/render-node" to "index.ts/render-node").
export default defineConfig({
	resolve: {
		alias: {
			"effect-motion/render-node": fileURLToPath(
				new URL("../motion/src/render-node.ts", import.meta.url),
			),
			"effect-motion": fileURLToPath(
				new URL("../motion/src/index.ts", import.meta.url),
			),
		},
	},
});
