# @effect-motion/cli

Command line for [effect-motion](https://github.com/julia-script/effect-motion): preview scenes in the browser and render videos — all driven by one `motion.config.ts`.

```sh
pnpm create effect-motion      # scaffold a project (npm/yarn/bun create work too)
motion studio                  # preview scenes with hot reload
motion render                  # render every target to MP4
```

Scaffolding lives in the [`create-effect-motion`](https://www.npmjs.com/package/create-effect-motion) package — this CLI is installed as a devDependency of the projects it creates.

## motion.config.ts

```ts
import { defineConfig } from "@effect-motion/cli";

export default defineConfig({
	targets: [
		{
			name: "hello-world",                 // unique; doubles as the output basename
			scene: "./src/scenes/hello-world.ts", // module exporting `scene`
			settings: { width: 1920, height: 1080, frameRate: 60, dpr: 1 },
			output: "./output",                  // a DIRECTORY — file name is derived
			// format: "mp4"                     // default (v1: mp4 only)
			// frames: 600                       // frame cap; required for infinite scenes
		},
	],
});
```

The output path is always `<output>/<name>.<format>` — never specified by hand. `settings` is the runner's settings subset plus `dpr` (supersampling: output pixels = scene dimensions × dpr, authored coordinates unchanged).

## studio

`motion studio` serves the `@effect-motion/react` Player over your scenes with hot reload (edits full-reload; playback restarts from frame 0). The picker lists every config target **plus** any unregistered `src/scenes/*.ts` — preview never requires registration. Registered scenes preview with their target `settings`, so the preview aspect matches the export. `--port`/`--host` pass through to Vite; the app is generated into `.motion/studio/` (gitignored by the scaffold).

Note: the studio previews through the SVG DOM renderer while `render` rasterizes through ThorVG — output is normally identical, but font fallback details can differ. The known upgrade path is a ThorVG-WASM preview sink.

## render

```sh
motion render                          # all targets from the nearest motion.config.ts
motion render hello-world              # just this target
motion render --config ../m.config.ts  # explicit config (tsc -p style)
motion render ./src/scenes/foo.ts      # configless: one scene file, default settings
motion render --fps 30 --dpr 2 --out-dir ./out   # flags beat config beat defaults
```

Flags: `--width --height --fps --dpr --seed --max-frames --frames --out-dir --format --config`. Targets render sequentially; a failing target doesn't stop the rest (non-zero exit + per-target summary at the end). Errors print a single message naming the offender — add `--verbose` for the full cause chain.

Encoding uses the ffmpeg build bundled via `ffmpeg-static` (H.264/yuv420p MP4, no system ffmpeg needed). That binary is GPL-licensed; it is invoked over a process boundary and this package remains MIT.
