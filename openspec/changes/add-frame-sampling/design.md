# Design: add-frame-sampling

## Context

`Scene.stream(scene, settings)` yields self-describing `Frame`s (instances, camera, size, frame rate) lazily, with no GPU involved. `Video.render` already composes stream → Node renderer → PNG → ffmpeg, and `motion render` is a thin CLI wrapper over it. `motion studio` already loads a project's `studio.ts` registry of named scenes.

## Goals / Non-Goals

**Goals:** one headless command giving stills, a contact sheet, or JSON for chosen frames; a selection syntax that reads naturally in a prompt (`--at 0,1s,end`, `--count 9`); loud, specific errors.

**Non-Goals:** pixel-exact output, labels drawn on tiles, animated previews, a watch mode, a new config file.

## Decisions

### D1. Split GPU-free sampling from rendering
`Frames` (selection, sampling, JSON) imports only `effect-motion` and `effect`; stills/sheet rendering lives in a separate module on `@effect-motion/renderer/node`. JSON output therefore works on GPU-less machines and the core logic is unit-testable without Dawn.

### D2. Selection grammar
A comma-separated list of: a non-negative integer (frame index), `<n>s` / `<n>ms` (time), `<n>%` (0–100, of the last frame index), `end` (last frame) — or the whole string `count N` (N ≥ 1). Times map to `round(seconds × frameRate)`; percentages to `round(p/100 × (length − 1))`; `count N` to `round(i × (length − 1) / (N − 1))` (`count 1` → frame 0), with N clamped to the frame count so no frame repeats. Frame index `i` is at time `i / frameRate`. Output order follows the request; duplicates are kept (a contact sheet tile per request).

### D3. Length only when needed, by running the scene
Only `%`, `end` and `count` need the scene length. It is computed by running the scene to the end once (no rendering), then the scene is run again to pick frames — both runs agree because a scene is a pure function of `(scene, settings)`. Index/time-only selections stream just up to the highest requested frame. A scene exceeding its finite `maxFrames` dies with the existing maxFrames defect; with `maxFrames: Infinity` a length-needing selection fails up front with a typed error.
*Alternative:* buffer every frame in one pass — rejected for memory on long scenes; noted as a `ponytail:` upgrade if a second pass is ever too slow.

### D4. Typed errors naming the value
Invalid selectors, out-of-range frames, empty scenes and infinite-end requests fail with `FrameSelectionError` whose message names the offending value and, for range errors, the scene length (`Frame 60 (2s) is out of range: the scene has 31 frames (0–30).`).

### D5. JSON shape
`toJson` projects each sample to `{ frame, time, width, height, frameRate, camera, root, instances }` — the frame's plain data, `JSON.stringify`-ready. Render-only fields (`backgroundColor`, `comps`) are omitted to keep agent-facing output focused on entity state.

### D6. CLI as a thin wrapper
`motion frames` resolves the scene key from `studio.ts` (no/unknown key → list available keys), parses flags into a selection, and calls the export library — like `motion render` → `Video.render`.

### D7. The scene ends where its video ends
`%`, `end` and `count` measure the frames `Scene.stream` produces — exactly what `Video.render` encodes and the player shows. The dogfood run asked for sheets to include exit tails after `Scene.finish`; they are not added. A root-level tail (or background) is cut at the scene's end in every output, so a sheet that showed it would show frames that never render. A beat's exit that should be seen belongs in a fork (awaited at scene end) or before the body returns.

### D8. Loaders reach the renderer, checked by the type system
Frames carry their font/image loaders only as a phantom type (`Frame<Resources>`); the renderer reads the loaders from context at render time. `Stills.render`/`contactSheet` are generic over the frames' resources and return an effect requiring them, so omitting `Font.layer`/`Image.layer` is a compile error rather than a runtime `no font loader` defect. The CLI builds the studio's `layers` once (`Layer.build`) and provides the context to sampling and rendering; the studio module is untyped at runtime, so the CLI restates the `studioConfig` pairing (scene loaders ⇔ `layers`) as `Resource.LoaderBrand` once, which keeps the missing-provide case a compile error inside the CLI too.

### D9. Sheet size and zoom
Sheets default to 480 px wide tiles (`--tile-width` overrides; box-downscaled, aspect kept) — full-size 1080p tiles made a nine-tile sheet 7692 px wide, too big for an agent to read cheaply. `--range FROM..TO` spreads `--count` over a span (`count N FROM..TO` in the selection grammar), for zooming into a transition. The scene list prints each scene's length so agents know which times are in range.

### D10. Releasing the GPU
The Node renderer destroys its Dawn device when its scope closes (after three's own release). A live device kept Node's event loop polling, so scripts using `Stills` directly never exited.

## Risks / Trade-offs

- **Second pass cost** for `%`/`end`/`count` on long scenes → acceptable (no rendering); upgrade path noted in code.
- **Listing runs every scene** to measure it → fine for studio-sized projects (the dogfood project's six scenes list in ~1 s); a scene that fails to run lists as `failed to run` rather than hiding the others.
- **GPU required for PNGs** → GPU tests skip on GPU-less CI like existing e2e tests; JSON path unaffected.
