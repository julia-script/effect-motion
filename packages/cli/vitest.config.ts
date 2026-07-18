import { defineConfig } from "vitest/config";

// Unlike the other packages, no source aliasing here: the CLI's runtime
// imports of effect-motion/@effect-motion/export are what a published
// install would resolve (workspace dist), and fixture scenes loaded through
// the Vite loader must resolve the SAME instances — aliasing only the
// test side would split module identity (shape renderer registries live in
// module scope). Tests therefore need `pnpm build` output for the
// upstream packages, same as `pnpm check`.
export default defineConfig({
	test: {
		// the render integration test boots vite + ffmpeg
		testTimeout: 60_000,
	},
});
