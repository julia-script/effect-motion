# Working in this project

This is an [effect-motion](https://github.com/julia-script/effect-motion) project: motion graphics written as deterministic, frame-exact scenes in TypeScript, rendered to video. Read this before writing or editing scenes.

## Layout and commands

- `src/scenes/*.ts` — one scene per module, each exporting `scene`. `Scene.make("Display Name", gen, meta?)` optionally names a scene for the studio picker.
- `src/main.ts` — the movie: an ordinary scene that sequences the others (`Scene.play` + `handle.finished`). Nothing is special about it.
- `studio.ts` — the studio registration: `studioConfig({ scenes, layers })`. Record keys are unique identifiers; ONLY registered scenes appear in the picker, so add an import + entry for every new scene. Scenes with typed resources (fonts, images) need their loaders in `layers` — the file will not compile until every registered scene is covered.
- `render.ts` — an ordinary program default-exporting a `Video.render(...)` effect. More outputs are more calls; loader layers are provided here with `Effect.provide` (compile-checked). Knobs (paths, fps, seed) live in this code — there are no CLI flags.
- `src/assets/` — static files (images, fonts).
- `motion studio [file]` — browser preview with hot reload of `studio.ts` (or the given entrypoint).
- `motion render [file]` — execute `render.ts` (or the given entrypoint) with the platform provided. `--verbose` prints full error cause chains. The same file runs standalone via `tsx render.ts` by piping through `NodeServices` from `@effect/platform-node`.

Verify a scene change by rendering it (`motion render`) or checking it in the running studio — not by reading code alone.

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
- Scene coordinates are the scene's OWN comp config — `Scene.make(gen, { width, height, backgroundColor })` (this template: 1920×1080). `dpr` (a `Video.render` option) scales output pixels, not coordinates.
- The `effect` dependency is pinned **exactly** — upgrading it can change seeded-random sequences. Never bump it casually; upgrade `effect` and `effect-motion` together, deliberately.

## Entrypoints

```ts
// studio.ts — what the studio previews
export default studioConfig({
	scenes: {
		intro,                                      // key = identifier, label = scene name ?? key
		fancy: { scene: fancy, fps: 30 },           // per-entry player options
	},
	// layers: Layer.mergeAll(Font.layer(...), …)  // REQUIRED once a scene declares resources
});

// render.ts — what `motion render` executes
export default Effect.gen(function* () {
	yield* Video.render(intro, "./output/intro.mp4", { settings: { frameRate: 60 } });
	// yield* Video.render(intro, "./output/intro-hd.mp4", { dpr: 2 });  // more outputs = more calls
});
```

Render the same scene several times for variants (resolutions, dpr). An infinite scene (one that never finishes) must pass `frames` in its `Video.render` options, or rendering would never end.
