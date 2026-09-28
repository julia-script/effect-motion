import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// tests run against workspace source, not dist — no build required
export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^effect-motion\/(.*)$/,
				replacement: `${fileURLToPath(new URL("../motion/src/", import.meta.url))}$1.ts`,
			},
			{
				find: /^effect-motion$/,
				replacement: fileURLToPath(
					new URL("../motion/src/index.ts", import.meta.url),
				),
			},
		],
	},
});
