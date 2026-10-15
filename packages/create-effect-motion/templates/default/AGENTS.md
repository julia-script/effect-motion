# Working in this project

This is an [effect-motion](https://github.com/julia-script/effect-motion) project: motion graphics written as deterministic, frame-exact scenes in TypeScript, rendered to video. Read this before writing or editing scenes.

## Layout and commands

- `src/scenes/*.ts` — one scene per module, each exporting `scene`. `Scene.make("Display Name", gen, meta?)` optionally names a scene for the studio picker.
- `src/main.ts` — the movie: an ordinary scene that sequences the others (`Scene.play` + `handle.finished`). Nothing is special about it.
- `studio.ts` — the studio registration: `studioConfig({ scenes, layers })`. Record keys are unique identifiers; ONLY registered scenes appear in the picker, so add an import + entry for every new scene. Scenes with typed resources (fonts, images) need their loaders in `layers` — the file will not compile until every registered scene is covered.
- `render.ts` — an ordinary program default-exporting a `Video.render(...)` effect. More outputs are more calls; loader layers are provided here with `Effect.provide` (compile-checked). Knobs (paths, fps, seed) live in this code — there are no CLI flags.
- `src/assets/` — static files (images, fonts). Load them with the `asset` helper below, which works in both `motion studio` (browser) and `motion frames`/`motion render` (Node).
- `motion studio [file]` — browser preview with hot reload of `studio.ts` (or the given entrypoint).
- `motion render [file]` — execute `render.ts` (or the given entrypoint) with the platform provided. `--verbose` prints full error cause chains. The same file runs standalone via `tsx render.ts` by piping through `NodeServices` from `@effect/platform-node`.

- `motion frames [scene]` — sample a registered scene headlessly (see below). With no scene, lists the keys with each scene's length (frames and seconds).

## Check your work

Verify every scene change by looking at it — not by reading code alone. After an edit:

1. `motion frames <scene> --sheet` writes `.motion/frames/<scene>/sheet.png`, a grid of evenly spaced frames (`--count N`, default 6), and prints `tile=<i> frame=<f> time=<t>` per tile (`time` is in seconds, here and in the JSON). Read the sheet image: tiles go left to right, top to bottom. Zoom into a stretch with `--range 7.5s..8.5s` (spreads `--count` over it); tiles are 480 px wide unless you pass `--tile-width`.
2. For specific moments, `motion frames <scene> --at 0,1.5s,50%,end` writes one PNG per frame (indices, times, percentages, `end`).
3. For exact positions and values, `motion frames <scene> --at end --json -` prints each frame's camera and every instance's data as JSON on stdout (no GPU needed; `--json out.json` writes a file). Trust the JSON over eyeballing pixels.

Frames are deterministic: same scene + settings → same JSON. `%`, `end` and `--count` fail on infinite scenes; use indices or times there. For a final check, render with `motion render` or watch it in `motion studio`.

## Writing scenes

A scene is an Effect generator: instantiate entities, then yield animations.

```ts
import { Color, Entity, Motion, Physics, Scene } from "effect-motion";

export const scene = Scene.make(function* () {
	const dot = yield* Scene.instantiate("Circle", {
		position: Entity.vec3({ x: -660 }), radius: 80, fillColor: Color.hex("#7f5af0"),
	});
	yield* Motion.moveTo(dot, { x: 660 }, "1200 millis", "easeInOutCubic");
	yield* Physics.springTo(dot, { y: 240 }, "smooth");
});
```

- **Animators come in pairs**: `verb(instance, from, to, …)` (explicit origin) and `verbTo(instance, to, …)` (origin read from the instance). Prefer the `To` form unless you need a fixed origin.
- **Prefer semantic helpers** (`Motion.moveTo`, `Motion.fadeTo`, `Physics.springTo`) over raw `tweenTo` when one exists — they carry per-entity meaning (moving a Line translates both endpoints; moving a Group carries its subtree). Use `tweenTo` for fields without a trait (`radius`, `width`, custom fields).
- **Springs have no duration** — length emerges from the simulation (presets in `Physics.springs`). Springy motion on raw fields uses elastic/bounce *easings*, not physics. Preset settle times at 60 fps (100 px → 1000 px moves; longer moves take a little longer): `strike` ~0.8 s, `jump` ~1.5 s, `smooth` ~2–2.5 s, `beat` ~2.5–3 s, `swing` ~3.5–4 s, `plop` ~7–8 s, `bounce` ~37–44 s. A spring runs until it settles, so `bounce` or `plop` in a sequence stretches the whole scene; check the length with `motion frames`.
- **Every animator is a dual**: `Motion.tweenTo(dot, …)` or `dot.pipe(Motion.tweenTo(…))` — both are idiomatic.
- **Composition**: sequence by yielding one animation after another; `Scene.all([...])` runs them together; `Scene.chain`/`Scene.stagger` sequence with schedules; `Scene.fork` starts a branch you can join later; `Scene.play(otherScene)` mounts a whole scene (await `handle.finished`). A played scene keeps its own camera: camera moves inside a beat render exactly as they do standalone, so per-beat precomps can each move their camera. `Scene.finish` marks a scene's semantic end — anything after it is a tail that keeps playing without being waited on.

## Making it look good

Slow, centered, flat scenes read as boring. Plan the beats first, then:

- **Rhythm** — 6–8 beats per 15 s. Cut on the beat: the next idea lands as the last one settles. Hold a finished state 0.3–0.6 s, not seconds.
- **Overlap** — start the next entrance before the last exit ends: `yield* Scene.fork(exitOfOld)`, then animate the new thing. Never fade to empty and back.
- **Contrast** — full-bleed color fields that change per beat; oversized type that fills the frame (`fontSize` 200–400 at 1920×1080); one accent color on a neutral palette.
- **Layered depth** — foreground, midground and background at different `z`, moving at different speeds (usually: the camera moves, parallax does the rest).
- **Easing** — entrances `easeOutExpo`/`easeOutBack`, exits `easeInExpo`/`easeInCubic`, camera moves `easeInOutCubic`/`easeInOutExpo`, `Physics.springTo` for things that settle. `linear` only for constant drift.
- Judge taste on the sheet too: a tile that looks empty, sparse or small-in-the-middle is.

Scene space: x right, y up, +z toward the camera, origin at frame center. Angles are radians.

| Effect | How |
|---|---|
| Camera push / pull | `camera.pipe(Camera.lookAt(point), Camera.dollyTo(distance, dur, ease))` — distance to the point of interest (default ≈ 2667 at 1920 wide) |
| Orbit / swing | `Camera.orbitTo(radians, dur, ease)` around the point of interest (set one with `Camera.lookAt` first) |
| High angle / crane | `Scene.update(camera, …)` its `position` (e.g. `y: 1400`), then `lookAt` |
| Parallax | layers at different `z` + any camera move |
| Tilted planes, card flips | `rotation: Entity.vec3({ y: 0.6 })` on any shape, or `Motion.rotateTo(card, { y: Math.PI }, dur, ease)`. At rotation 0 a shape faces the camera; any other rotation makes it a real plane in 3D |
| Spin | `Motion.rotateTo(logo, -2 * Math.PI, dur, ease)` — a number spins in the picture plane (radians, negative = clockwise) |
| Grids, dot fields | loops of `Circle`/`Rect` instances placed in 3D, revealed with `Scene.stagger` |
| Scale punch / pop | `Motion.scale(badge, 0, 1, "400 millis", "easeOutBack")` to pop in; `Motion.scaleTo(logo, 1.2, …)` then back to 1 for a punch. Scale works on any shape and on a Group (scales the whole subtree); `{ x: 1.4, y: 0.8 }` stretches |
| Fade or move a whole section | put it in a `Group` and animate the group: `fadeTo`, `moveTo`, `scaleTo`, `rotateTo` all carry the children |
| Color field per beat | a huge `Rect` far back (`z: -3000`, 12000×7000) + `Motion.tweenTo(field, { fillColor }, …)` |
| Type reveals | one `Text` per word or line; stagger `moveTo` + `fadeTo`, or pop `fontSize` |
| Precomps | build a section as its own scene; mount it with `Scene.play(section)`. Each precomp has its own camera (`Scene.camera` inside it) and clips to its own `width`×`height`; move, fade or scale `handle.group` to transform it as one layer |
| Rectangular masks, masked type reveals | a precomp smaller than the frame is a rectangular mask: content outside its bounds is clipped. Slide text into a text-high precomp (recipe below) |
| Rack focus, depth blur | open the camera's lens once, then pull focus with a plain tween (recipe below). `aperture` is the lens radius in world units: at rest, content far behind the focus plane blurs up to about `aperture` px (capped at 30); 20–60 reads at 1920×1080. `focusDistance` is a view distance: camera `z` minus the layer's `z`. A `Hud` stays sharp; a precomp renders sharp inside (its own camera's `aperture` is ignored) and blurs as one layer by the parent's lens |
| Labels, lower thirds, wipes | children of a `Hud` are in screen space: the camera doesn't move them and they paint on top. A full-frame `Rect` in a `Hud` sliding across is a wipe (recipe below) |

**Not available yet — design around it:** masks other than rectangles (only a precomp's bounds clip) and track mattes; per-letter text (a `Text` is one block); motion blur and other blurs (depth of field is the only one); lit or shaded 3D meshes; curves and holes in `Path` (straight `M`/`L`/`Z` segments — sample a curve into points yourself; each closed subpath fills on its own); images other than PNG/JPEG in `motion frames`/`motion render`. Overlaps: nearer `z` wins; at equal `z` the later-instantiated entity paints on top.

Recipe — camera push through z-layered cards:

```ts
const field = yield* Scene.instantiate("Rect", {
	position: Entity.vec3({ z: -3000 }), width: 12000, height: 7000, fillColor: Color.hex("#1a1a2e"),
});
for (const [i, z] of [900, 300, -300, -900].entries()) {
	const side = i % 2 === 0 ? -1 : 1; // cards flank the flight path, tilted toward it
	yield* Scene.instantiate("Rect", {
		position: Entity.vec3({ x: side * 700, y: side * 120, z }), rotation: Entity.vec3({ y: side * 0.6 }),
		width: 620, height: 380, fillColor: Color.hex("#e8e8f0"),
	});
}
yield* Scene.instantiate("Rect", { // the hero the push lands on
	position: Entity.vec3({ z: -1500 }), width: 800, height: 450, fillColor: Color.hex("#ff5a1f"),
});
const camera = yield* Scene.camera;
yield* Scene.all([
	camera.pipe(Camera.lookAt({ x: 0, y: 0, z: -1500 }), Camera.dollyTo(1200, "2400 millis", "easeInOutExpo")),
	Motion.tweenTo(field, { fillColor: Color.hex("#2b1055") }, "2400 millis"),
]);
```

Recipe — masked type reveal (a precomp's bounds are the mask):

```ts
// a 1600×240 window; the text starts below it and rises in, clipped at the edge
const revealLine = (text: string) =>
	Scene.make(function* () {
		const line = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ y: -240 }), text, fontSize: 180,
			textAnchor: "middle", baseline: "middle", fillColor: Color.hex("#e8e8f0"),
		});
		yield* Motion.moveTo(line, { y: 0 }, "600 millis", "easeOutExpo");
	}, { width: 1600, height: 240 }); // no backgroundColor: transparent, only the clip shows

export const scene = Scene.make(function* () {
	const at = (y: number) => Scene.instantiate("Group", { position: Entity.vec3({ y }) });
	yield* Scene.play(revealLine("MAKE IT"), { parent: yield* at(130) });
	yield* Scene.sleep("150 millis");
	const last = yield* Scene.play(revealLine("MOVE"), { parent: yield* at(-130) });
	yield* last.finished;
});
```

Recipe — screen-space label and wipe with `Hud`:

```ts
const label = yield* Scene.instantiate("Text", {
	position: Entity.vec3({ x: -900, y: 460 }), text: "01 — DEPTH", fontSize: 48,
	textAnchor: "start", fillColor: Color.hex("#ff5a1f"),
});
const wipe = yield* Scene.instantiate("Rect", { // parked just off the left edge
	position: Entity.vec3({ x: -1920 }), width: 1920, height: 1080, fillColor: Color.hex("#ff5a1f"),
});
yield* Scene.instantiate("Hud", { children: [label, wipe] }); // top level of the scene, not inside a Group
const camera = yield* Scene.camera;
yield* camera.pipe(Camera.lookAt({ x: 0, y: 0, z: 0 }), Camera.orbitTo(0.6, "1500 millis", "easeInOutCubic")); // label stays put
yield* Motion.moveTo(wipe, { x: 0 }, "400 millis", "easeInExpo"); // cover the frame, then cut to the next beat
```

Hud coordinates are the frame's: origin at the center, 1 unit = 1 px of the scene's `width`×`height`, whatever the camera does. A `Hud` inside a precomp pins to that precomp's frame.

Recipe — rack focus from a title to the backdrop:

```ts
yield* Scene.instantiate("Rect", { // far backdrop, soft while the title is in focus
	position: Entity.vec3({ x: 450, z: -2500 }), width: 1400, height: 1400, fillColor: Color.hex("#ff5a1f"),
});
const card = yield* Scene.instantiate("Rect", { width: 900, height: 360, fillColor: Color.hex("#e8e8f0"), opacity: 0 });
const title = yield* Scene.instantiate("Text", {
	text: "IN FOCUS", fontSize: 160, textAnchor: "middle", baseline: "middle", fillColor: Color.hex("#1a1a2e"), opacity: 0,
});
const camera = yield* Scene.camera;
const { position } = yield* Scene.data(camera);
const focusOn = (z: number) => ({ focusDistance: position.z - z }); // a view distance
yield* Scene.update(camera, (p) => ({ ...p, aperture: 40, ...focusOn(0) }));
yield* Scene.all([Motion.fadeTo(card, 1, "600 millis"), Motion.fadeTo(title, 1, "600 millis")]);
yield* Motion.tweenTo(camera, focusOn(-2500), "1200 millis", "easeInOutCubic"); // title softens, backdrop sharpens
```

Depth of field is correct for opaque content; a see-through layer blurs at its own depth. It roughly doubles render time.

Recipe — staggered dot floor in 3D (`import { Schedule } from "effect"`):

```ts
const rows = [];
for (let r = 0; r < 12; r++) {
	const row = [];
	for (let c = 0; c < 16; c++) {
		row.push(yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: (c - 7.5) * 110, y: -200, z: (r - 5.5) * 110 }),
			radius: 14, fillColor: Color.hex("#e8e8f0"), opacity: 0,
		}));
	}
	rows.push(row);
}
const camera = yield* Scene.camera; // raise the camera so the floor reads as a plane
yield* Scene.update(camera, (c) => ({ ...c, position: Entity.vec3({ ...c.position, y: 1400 }) }));
yield* camera.pipe(Camera.lookAt({ x: 0, y: -200, z: 0 }));
yield* Scene.all([
	Scene.stagger(rows.map((row, r) => Scene.all(row.map((dot, c) => Scene.all([
		Motion.fadeTo(dot, 1, "300 millis"),
		Motion.moveTo(dot, { y: -200 + 90 * Math.sin(c * 0.6 + r * 0.4) }, "700 millis", "easeOutBack"),
	])))), Schedule.spaced("60 millis")),
	camera.pipe(Camera.orbitTo(0.7, "2500 millis", "easeInOutSine")),
]);
```

## Fonts and images from `src/assets/`

A font or image is a typed resource: declare it, `yield*` it in the scene, and provide its bytes in `studio.ts` `layers` and in `render.ts` (`Effect.provide`). Read files through `import.meta.url` so one loader works in the browser studio and in Node:

```ts
// src/assets.ts
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Font from "effect-motion/Font";
import * as Image from "effect-motion/Image";
import { EffectMotionError, Resource } from "effect-motion";

const asset = (file: string) => {
	const url = new URL(`./assets/${file}`, import.meta.url);
	return url.protocol === "file:" // Node: motion frames / motion render
		? Effect.tryPromise({
				try: async () => {
					const fs = await import("node:fs/promises");
					return new Uint8Array(await fs.readFile(url));
				},
				catch: (cause) => EffectMotionError.of(`could not read ${file}`, cause),
			})
		: Resource.fetchBytes(url.href); // browser: motion studio
};

export const Inter = Font.Font("Inter");
export const Logo = Image.Image("logo");
export const layers = Layer.mergeAll(
	Font.layer(Inter, asset("Inter-Bold.ttf")),
	Image.layer(Logo, asset("logo.png")), // PNG or JPEG
);
```

Helpers that take any font or image use the wide types `Font.Font` / `Image.Image` — not `Font.Font<"Inter">`, which accepts only that one id.

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
