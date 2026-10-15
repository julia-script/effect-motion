import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tests run against workspace source, not dist — no build required; the
// regex alias covers deep per-actor imports (effect-motion/Color) too
export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^effect-motion$/,
				replacement: fileURLToPath(
					new URL("../motion/src/index.ts", import.meta.url),
				),
			},
			{
				find: /^effect-motion\/(.*)$/,
				replacement: fileURLToPath(
					new URL("../motion/src/$1.ts", import.meta.url),
				),
			},
		],
	},
});
