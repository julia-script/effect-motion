# effect-motion — Pitch

effect-motion is a motion graphics tool for developers. The videos you'd
otherwise open After Effects for — explainers, product demos, animated
diagrams, 2.5D shorts — you make by writing TypeScript: write a scene, play
and scrub it live in the browser, render the same scene to video, and get
the same result every run. It's for developers who'd rather write a scene
than scrub a timeline — especially, but not only, people who love
[Effect](https://effect.website): a scene *is* an Effect, so motions
compose with the combinators Effect programmers already know, and errors,
resources, and dependency injection work the way the rest of their code
does.

Explainer video is its home turf. A real 3D camera (position, orientation,
focal length, depth of field) flies over 2D entities, so dolly moves,
parallax, and rack focus — the grammar of the 2.5D explainer — come from
the same animators that tween a circle. The same pipeline runs headlessly
for data-driven video: thumbnails, personalized clips, anything rendered
server-side, on a real GPU with no browser in the loop.

And scenes are a target AI can hit. A prompted video needs exactly what a
GUI editor can't give an agent and effect-motion does: scenes as plain
typed code over a closed set of schema-backed entities, so generated output
is checkable at every step — the compiler rejects an animator applied to a
field the entity doesn't have, invalid scenes fail loudly naming the
offender, and a deterministic render means the video an agent produced in
CI is the video you'll get every time after. The scaffolder ships an
`AGENTS.md` of authoring rules in every new project, so coding agents
arrive already knowing the house grammar. Prompt, typecheck, render,
review the diff — video generation with the same feedback loop as the rest
of software.

The bet underneath is that animation is a *concurrency* problem, and Effect
already solved concurrency. Where timeline tools model a scene as tracks and
keyframes, effect-motion models it as a program: `Scene.all` runs motions
concurrently, `Scene.stagger` offsets them, `Scene.fork` branches them — and
a frame barrier (the Phaser) makes every concurrent animation advance one
frame at a time, together. That is what makes determinism structural rather
than aspirational: no wall-clock, no `Math.random()` (a seeded `Random`
service is provided), durations are frame counts, tweens land their final
frame exactly on target, and springs snap exactly on settle. Effect also
supplies the rest of the engineering substance for free — errors as typed
values, resources in scopes, renderers as swappable layers.

It is deliberately not a GUI editor and not a runtime UI-animation library.
The scene file is the artifact: plain TypeScript you can diff, review, test,
generate, and render in CI.

## The parts

### `effect-motion` — scenes as programs

The core. Entities are a closed union of schema-backed shapes (Circle, Rect,
Ellipse, Line, Path, Text, Group, Image, a screen-space Hud) plus a Camera
that is an ordinary instance — the same animators that move a circle orbit
the camera.
Animators come in two layers: raw `Motion.tween`/`tweenTo` on any numeric
field the entity's schema declares, and semantic `move`/`fade`/`spring`
helpers that treat the entity as one unit (geometry is relative to
`position`, so moving a Line translates both endpoints, moving a Group
carries its subtree). Composition is `chain`, `all`, `stagger`, `fork`,
`background`, `repeat`; physics springs have no duration — length emerges
from the simulation. The camera model is After Effects–style: focal length
in scene pixels, 50mm-equivalent default. Failures are loud defects naming
the offender. The package is renderer-free — it produces frame data, and no
rendering dependency appears in its tree.

**Useful alone for:** anyone who wants frame streams as pure data — testing
animation logic, driving a custom renderer, or analyzing motion without ever
touching a GPU.

### `@effect-motion/three` — three.js, Effect-shaped

A bindings-only Effect wrapper over three.js that knows nothing about frames
or entities. Wrapped types are branded handles; construction owns teardown
through `Scope`; fallible and async calls land in the typed error channel,
while per-frame mutation stays synchronous and chainable — no Effect
allocation to describe an infallible field write. Its `/node` entry installs
Dawn-backed WebGPU and the environment shims three needs, which is what
makes headless GPU rendering work without a browser.

**Useful alone for:** not much, by design — it wraps only what effect-motion
itself needs. It's a separate package for organization: the three.js
boundary lives in one place, instead of leaking through the renderer.

### `@effect-motion/renderer` — the only place frames meet three

The single frame renderer. A long-lived retained three scene diffs against
each frame under a `build`/`update`/`dispose` contract per entity; occlusion
is the GPU z-buffer; depth-of-field is a per-pixel post chain, bypassed
entirely at aperture 0. Two adapters share everything else: a browser canvas
for playback and a Node PNG path for export. One renderer for both is the
point — preview and export can't drift apart when they are the same code.

**Useful alone for:** turning effect-motion frame data into pixels anywhere
WebGPU runs — including embedding rendered scenes into an existing
three-based app.

### `@effect-motion/react` — the Player

React bindings: a `<Player>` component (and the hook under it) with
play/pause, scrubbing, loop toggle, and keyboard shortcuts. Frames stream in
as the scene runs on a wall-clock accumulator, so playback starts before the
whole scene is computed; finite scenes keep pulled frames so seeking
backwards is free, infinite scenes keep a bounded window. Scenes that
declare fonts or images require their loaders at compile time — a missing
`renderLayers` is a type error, not a blank canvas.

**Useful alone for:** embedding live, scrubbable scenes in any React app or
docs site — the project's own docs run every example through it.

### `@effect-motion/export` — scene to video, one call

Node-only export: `Video.render(scene, "out.mp4", …)` composes the whole
pipeline — `Scene.stream` → GPU renderer (Dawn) → PNG → ffmpeg — reading
framerate and dimensions from the scene's own metadata, with no temp files
(frames pipe straight into ffmpeg's stdin). The pipeline's midpoint is
plain PNG frames and its last stage is ffmpeg, so the output menu is
ffmpeg's menu: H.264 MP4 is today's one-call default, raw PNG frames are a
stage you can already tap, and further formats — GIF, other containers and
codecs ffmpeg accepts — are the planned direction, an option away rather
than a redesign. A bundled `ffmpeg-static` binary with libx264 means H.264
works with no system ffmpeg; it is invoked over a process boundary, its GPL
license is documented, and a `binary` override swaps in your own build.
`Ffmpeg.encode` is exposed for driving the stages yourself.

**Useful alone for:** server-side and CI video generation — render on a
machine that has never opened a browser.

### `@effect-motion/cli` — studio and render

The project-level workflow, driven by two code entrypoints rather than a
config format. `motion studio` serves the Player over the scenes a
`studio.ts` registers — a typed record whose scene modules are imported as
values, so declared resources typecheck at authoring time — with hot reload
via Vite HMR. `motion render` executes a `render.ts`: an ordinary program
default-exporting a `Video.render(…)` effect, which also runs standalone
under `tsx`. Even the render pipeline is code, not configuration.

**Useful alone for:** the daily loop — edit, watch, ship — without writing
any playback or export code.

### `create-effect-motion` — the first five minutes

`pnpm create effect-motion` scaffolds a working project: a hello-world
scene, a `main.ts` movie composing scenes, `studio.ts` and `render.ts`
entrypoints, exact version pins, git init, and — notably — an `AGENTS.md`
of authoring rules aimed at
AI coding agents, because schema-backed entities and typed animators are an
API agents can be taught to write correctly. Every prompt has a flag twin,
so it scaffolds non-interactively in scripts and CI.

**Useful alone for:** going from nothing to a previewing, rendering project
in one command.

## Why this exists at all

Video-as-code is a proven category. Remotion made it mainstream in
TypeScript — videos as React components, rendered by screenshotting a
headless Chromium and stitching frames with ffmpeg — and it is intensely
active (its 4.0 series was still releasing near-daily as of July 2026).
Manim proved the code-first explainer video in Python long before that.
These are the references that legitimized writing video in a programming
language, and effect-motion's export pipeline follows the same last-mile
pragmatism (ffmpeg encodes the frames).

The combination effect-motion bets on, though, doesn't appear to exist yet
in TypeScript. Surveying the field (July 2026): Remotion authors in
React/DOM and renders through a browser's screenshot path, with a
source-available license that requires a paid company license for for-profit
teams of four or more. Revideo brings code-first authoring and headless
export to TypeScript but renders through Canvas 2D, and its team's focus has
shifted toward a commercial visual editor built on the engine. Theatre.js
centers a Studio GUI as part of its authoring story (its core package last
released May 2024). GSAP and Motion are runtime UI-animation libraries —
excellent at animating live pages, with no frame-export contract at all.
ONDA is the closest in spirit — deterministic GPU rendering with no browser
in the loop — but its engine is Rust/native rather than the web's own stack.

effect-motion's slice: **TypeScript authoring, determinism as a structural
contract, real WebGPU rendering in both browser and headless Node, MIT
throughout (the bundled ffmpeg binary is the one documented GPL exception,
kept behind a process boundary), and no GUI editor in the loop.** As of this
writing we could find no library occupying that combination. And beneath
the feature list sits the deeper differentiator: scenes compose with Effect,
so the animation library and the application code share one idiom for
concurrency, errors, resources, and dependency injection.

## Why seven packages earn their keep

Each boundary follows a real seam, and each is auditable in the dependency
graph. The core computes frames without knowing pixels exist. The three
wrapper wraps a library without knowing frames exist. The renderer is
deliberately the *only* place the two meet — which is precisely what lets
one renderer serve both the browser canvas and the Node PNG path, so
"export matches preview" is an architectural fact rather than a QA goal.
React, export, and CLI are thin consumers of those three; none reaches
around the layering. The same discipline runs inside the packages: one
module per actor, deep per-actor imports, main exports that are mostly data
with composable sibling functions — the shape Effect itself uses — so
consumers tree-shake to what they touch and every capability has exactly one
home.

## Goals

- **Determinism by construction.** Scenes are pure functions of
  `(scene, settings)`: seeded randomness, a frame-locked clock, tweens that
  land exactly on target, springs that snap on settle. Same seed and
  settings → same frame count, same frame data.
- **One scene, every output.** The same TypeScript module plays in the
  React Player, previews in the studio, and renders to video in Node — no
  per-target scene changes, ever.
- **Real GPU rendering without a browser in the loop.** WebGPU in the
  browser, Dawn in Node, one renderer for both.
- **Effect-native throughout.** Errors are typed values, resources live in
  scopes, renderers and loaders are layers, composition is the combinators
  Effect users already know.
- **Type safety as the guardrail.** Fading an entity with no opacity is a
  compile error naming the missing field; scenes that declare fonts won't
  compile into a player that doesn't load them.
- **Loud failures.** Invalid springs, unknown timing names, and scene-graph
  violations die with defects naming the offender — never a silently wrong
  frame.
- **Authoring that agents can be taught.** Schema-backed entities, a closed
  union, paired animator forms, and a scaffolded `AGENTS.md` make the API
  legible to AI coding tools, not just humans.

## Non-goals

- **A GUI editor.** The scene file is the source of truth — diffable,
  reviewable, generatable. Tooling that *views* scenes (the studio, the
  Player) is welcome; tooling that owns them instead of the code is not.
- **Runtime UI animation.** Animating live application interfaces is
  GSAP's and Motion's territory; effect-motion produces finite, replayable
  scenes. Not competing there keeps the frame barrier and determinism
  contract intact.
- **Parsing inside the engine.** The engine renders a tree of instances; it
  never ingests markdown or rich text formats. Preprocessing is userland —
  a plain function emitting instances, run once, outside the scene — which
  keeps the per-frame path to rendering only.

## Audience

- **Developers making explainer and dev-content videos** who want scenes in
  version control and renders in CI, not project files in a GUI.
- **Effect users** who want motion graphics in the idiom they already write
  — the whole library is a showcase of Effect patterns applied to a visual
  domain.
- **AI-agent-driven pipelines** where a coding agent writes or edits
  scenes: typed schemas, compile-time applicability, and scaffolded
  authoring rules give agents a checkable target.
- **React developers** embedding deterministic, scrubbable animation in
  apps and docs sites via `<Player>` alone.
- **Teams rendering video server-side** — thumbnails, personalized clips,
  data-driven motion — through `@effect-motion/export` on machines with no
  browser.

## Success criteria

- All seven packages install from the public npm registry and are versioned
  through changesets (published at 0.4.x as of July 2026).
- `pnpm create effect-motion` on a clean machine yields a project where
  `pnpm studio` previews and `pnpm render` produces a valid H.264 MP4 with
  no system ffmpeg installed — exercised end-to-end by the export test
  suite.
- The same seed and settings reproduce the identical frame stream, covered
  by tests in the core package.
- One scene module renders through both the browser Player and headless
  Node export with zero scene-side changes.
- `packages/motion` has no rendering dependency in its tree — auditable
  from its `package.json`.
- Every animator ships as a base/To pair with dual call forms — auditable
  against the conventions in `AGENTS.md`.
- Animating a field an entity lacks fails to typecheck, naming the missing
  field.
- The docs site lets a stranger self-serve the full API surface without
  assistance — the one remaining committed item before v0.1 is declared
  done (API reference generated for all four library packages; concept and
  guide pages in progress).
