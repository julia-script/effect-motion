import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		// the biome-check test shells out to the biome binary
		testTimeout: 30_000,
	},
});
