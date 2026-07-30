# Tasks: rewrite-docs-site

## 1. Teardown

- [x] 1.1 Delete all handwritten MDX under `apps/docs/content/docs/` (keep `api/` and the top-level `meta.json` shell) and all `apps/docs/examples/*.scene.ts`; empty the registry to a stub that still typechecks
- [x] 1.2 Verify `pnpm --filter docs build` still passes with the emptied content tree (broken-link/registry fallout surfaced now, not at the end)

## 2. Navigation and section scaffolding

- [x] 2.1 Create the new `meta.json` tree: root order (index, getting-started, learn, guides, examples, api), `learn/` with the eight ordered pages, `guides/` with the six task-named pages, `examples/` empty for now
- [x] 2.2 Write `index.mdx` prose (hero scene embed placeholder until D7's pick exists) and `getting-started.mdx` (install → first scene → play → export a frame)

## 3. Learn pages (one primitive per page, each ends with its scene)

- [x] 3.1 `learn/scenes` — prose + ending scene (scenes are Effects; Scene.make/run/stream; Settings; frames)
- [x] 3.2 `learn/entities` — prose + ending scene (instantiate, shapes, children/visible/appendChild/removeChild, update/data)
- [x] 3.3 `learn/animators` — prose + ending scene (base/To pairs, dual forms, tween/move/fade, wait)
- [x] 3.4 `learn/timing` — prose + rebuilt full-HD easing-race scene
- [x] 3.5 `learn/physics` — prose + ending scene (spring/springTo, presets, no-duration model)
- [x] 3.6 `learn/composition` — prose + ending scene (chain, all, stagger, fork, background, repeat, finish)
- [x] 3.7 `learn/camera` — prose + ending scene (dolly/orbit/lookAt/follow, 2.5D depth; DoF is disabled — omit; particle-free parallax replaces the old camera-parallax)
- [x] 3.8 `learn/randomness` — prose + ending scene (seeded Random, determinism invariants)

## 4. Guides

- [x] 4.1 `guides/export-video` (bundled ffmpeg default, binary override)
- [x] 4.2 `guides/react-player`
- [x] 4.3 `guides/custom-fonts` (with renderLayers scene)
- [x] 4.4 `guides/images` (with renderLayers scene)
- [x] 4.5 `guides/custom-entities` (userland builders; renderer `renderers` option; nested scenes via Scene.play)
- [x] 4.6 `guides/cli`

## 5. Examples gallery (idea named in first sentence; scene above source)

- [x] 5.1 `sine-from-circle`
- [x] 5.2 `function-plot`
- [x] 5.3 `riemann-rects`
- [x] 5.4 `grid-warp`
- [x] 5.5 `bezier-3d` rebuilt at 1920×1080
- [x] 5.6 `depth-orbit`
- [x] 5.7 `min-seeker`
- [x] 5.8 `text-write-on`
- [x] 5.9 `streamlines`
- [x] 5.10 `camera-follow-graph`

## 6. Verification

- [x] 6.1 Pick the index hero scene (depth-orbit vs sine-from-circle) and wire it into `index.mdx`
- [x] 6.2 Audit: every scene declares `{ width: 1920, height: 1080 }`; grep confirms zero handwritten references to particles, top-left origin, traits, `usePlayer`, or SVG sinks
- [x] 6.3 `pnpm build && pnpm check && pnpm lint` green; click through every page on the dev server, confirm all scenes play smoothly
- [x] 6.4 Update the roadmap changelog line for the docs push once shipped (roadmap-sync territory; note only)
