// fixture: imports the source directly so tests need no built cli dist
import { defineConfig } from "../../../src/Config";

export default defineConfig({
	targets: [
		{
			name: "dot",
			scene: "./src/scenes/dot.ts",
			settings: { frameRate: 10 },
			output: "./output",
		},
		{
			name: "dot-hd",
			scene: "./src/scenes/dot.ts",
			settings: { frameRate: 10, dpr: 2 },
			output: "./output",
		},
	],
});
