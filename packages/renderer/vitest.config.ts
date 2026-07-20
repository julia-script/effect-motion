import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const motionSrc = fileURLToPath(new URL("../motion/src", import.meta.url));
const threeSrc = fileURLToPath(new URL("../three/src", import.meta.url));

// tests run against workspace source, not dist — no build required
export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^effect-motion\/(.*)$/,
				replacement: `${motionSrc}/$1.ts`,
			},
			{ find: /^effect-motion$/, replacement: `${motionSrc}/index.ts` },
			{
				find: /^@effect-motion\/three\/(.*)$/,
				replacement: `${threeSrc}/$1.ts`,
			},
			{
				find: /^@effect-motion\/three$/,
				replacement: `${threeSrc}/index.ts`,
			},
		],
	},
});
