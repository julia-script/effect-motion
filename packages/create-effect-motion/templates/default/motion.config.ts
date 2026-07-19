import { defineConfig } from "@effect-motion/cli";

// Each target is one rendered video: <output>/<name>.mp4
// `motion render` renders all of them; `motion render <name>` picks one.
export default defineConfig({
	targets: [
		{
			name: "hello-world",
			scene: "./src/scenes/hello-world.ts",
			settings: { width: 1920, height: 1080, frameRate: 60 },
			output: "./output",
		},
		{
			name: "main",
			scene: "./src/main.ts",
			settings: { width: 1920, height: 1080, frameRate: 60 },
			output: "./output",
		},
	],
});
