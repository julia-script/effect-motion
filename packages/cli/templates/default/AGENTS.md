# Working in this project

This is an [effect-motion](https://github.com/julia-script/effect-motion) project: motion graphics written as deterministic, frame-exact scenes in TypeScript, rendered to video. Read this before writing or editing scenes.

## Layout and commands

- `src/scenes/*.ts` — one scene per module, each exporting `scene`. Any file here is previewable without registration.
- `src/main.ts` — the movie: an ordinary scene that sequences the others (`Scene.play` + `handle.finished`). Nothing is special about it.
- `motion.config.ts` — render targets. Output is always `<output>/<name>.mp4`; never write output paths by hand.
- `src/assets/` — static files (images, fonts).
- `motion studio` — browser preview with hot reload (scene picker lists config targets plus unregistered scenes).
- `motion render [name...]` — render targets; `motion render ./src/scenes/foo.ts` renders one file with defaults. Flags beat config beat library defaults. `--verbose` prints full error cause chains.

Verify a scene change by rendering it (`motion render <target>`) or checking it in the running studio — not by reading code alone.

## Writing scenes

A scene is an Effect generator: instantiate entities, then yield animations.

```ts
import { Color, Motion, Physics, Scene, Shapes } from "effect-motion";

export const scene = Scene.make(function* () {
	const dot = yield* Scene.instantiate(Shapes.Circle, {
		x: 300, y: 540, radius: 80, fill: Color.hex("#7f5af0"),
	});
	yield* Motion.tweenTo(dot, { x: 1620 }, "1200 millis", "easeInOutCubic");
	yield* Physics.springTo(dot, { y: 300 }, Physics.springs.wobbly);
});
```

- **Animators come in pairs**: `verb(instance, from, to, …)` (explicit origin) and `verbTo(instance, to, …)` (origin read from the instance). Prefer the `To` form unless you need a fixed origin.
- **Prefer semantic helpers** (`Motion.moveTo`, `Motion.fadeTo`, `Physics.springTo`) over raw `tweenTo` when one exists — they carry per-entity meaning (moving a Line translates both endpoints; moving a Group carries its subtree). Use `tweenTo` for fields without a trait (`radius`, `width`, custom fields).
- **Springs have no duration** — length emerges from the simulation (presets in `Physics.springs`). Springy motion on raw fields uses elastic/bounce *easings*, not physics.
- **Every animator is a dual**: `Motion.tweenTo(dot, …)` or `dot.pipe(Motion.tweenTo(…))` — both are idiomatic.
- **Composition**: sequence by yielding one animation after another; `Scene.all([...])` runs them together; `Scene.chain`/`Scene.stagger` sequence with schedules; `Scene.fork` starts a branch you can join later; `Scene.play(otherScene)` mounts a whole scene (await `handle.finished`). `Scene.finish` marks a scene's semantic end — anything after it is a tail that keeps playing without being waited on.

## Determinism rules (non-negotiable)

- **Never** use `Math.random()`, `Date.now()`, or any wall-clock/OS state in a scene — every run must be byte-identical. Use the provided seeded random (`Effect.random`, seeded from `settings.seed`).
- Durations land exactly on target on the final frame; springs snap on settle. Don't add "fudge" frames.
- Scene coordinates are the `settings.width`/`height` of the target that renders them (this template: 1920×1080). `dpr` scales output pixels, not coordinates.
- The `effect` dependency is pinned **exactly** — upgrading it can change seeded-random sequences. Never bump it casually; upgrade `effect` and `effect-motion` together, deliberately.

## Config

```ts
export default defineConfig({
	targets: [{
		name: "intro",                    // unique — doubles as the output basename
		scene: "./src/scenes/intro.ts",
		settings: { width: 1920, height: 1080, frameRate: 60, dpr: 1 },
		output: "./output",               // a DIRECTORY; file name is derived
		// frames: 600                    // REQUIRED if the scene is infinite
	}],
});
```

A scene used by several targets renders once per target (e.g. different resolutions). An infinite scene (one that never finishes) must set `frames`, or rendering would never end.
