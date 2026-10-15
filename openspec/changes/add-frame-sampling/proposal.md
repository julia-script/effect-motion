## Why

An agent (or a human) authoring a scene in code has no way to *see* it without a browser: `motion studio` needs one, `motion render` produces a whole video. Checking "is the title centered at 1s?" or "does the end state look right?" should be one headless command that returns a few stills, a contact sheet, or the exact entity state — cheap enough to run after every edit.

## What Changes

- New `motion frames <scene>` command: sample chosen frames of a scene registered in the project's `studio.ts` and write PNG stills, a single contact-sheet PNG, and/or JSON state. No browser; rendering is headless (Dawn WebGPU), like `motion render`.
- A frame-selection syntax shared by all outputs: frame indices (`0,30`), times (`1.5s`, `500ms`), percentages (`50%`), `end`, and `count N` (N evenly spaced frames including the first and last).
- `@effect-motion/export` gains the library half, mirroring `motion render` → `Video.render`:
  - `Frames` (GPU-free): `parse` a selection, `sample` frames from `Scene.stream`, `toJson` their state. Never imports the renderer.
  - Stills + contact sheet rendering on the Node renderer.
- Docs: a how-to page (included in `llms.txt`), and scaffolded projects' `AGENTS.md` tells agents to use `motion frames` to check their work.

## Capabilities

### New Capabilities

- `cli-frames`: frame selection, sampling, JSON state, stills, contact sheet, and the `motion frames` command.

## Impact

**`packages/export`** — new `Frames` module (+ stills/sheet module); exports added to `index.ts`. **`packages/cli`** — new `frames` command, reusing the studio entrypoint loading. **`packages/create-effect-motion`** — scaffold `AGENTS.md` mentions the command. **Docs** — one new page. No core (`packages/motion`) change: sampling is built on the public `Scene.stream`.

**Determinism** — JSON is frame-level deterministic (same scene + settings → same JSON); PNG pixels are not guaranteed bit-exact across GPUs/drivers.

## Non-goals

Pixel-exact output guarantees, tile text labels, video/GIF previews, browser-based capture, a watch mode, and any new config file (`studio.ts` is the registry).
