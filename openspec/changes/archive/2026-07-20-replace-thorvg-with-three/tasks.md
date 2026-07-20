# Tasks: replace-thorvg-with-three

Stages mirror design.md's migration plan; each stage ends shippable. ThorVG
is deleted only in stage 3, after the player and export both run on three.

## 1. `@effect-motion/three` wrapper + `@effect-motion/renderer` packages (stage 1)

- [x] 1.1 Scaffold `packages/three` (`@effect-motion/three`, bindings-only: depends on `three`, NOT on `effect-motion`) and `packages/renderer` (`@effect-motion/renderer`, depends on `effect-motion` + the wrapper): package.json, tsconfig, Biome, vitest, Turbo wiring; browser-safe `.` entries
- [x] 1.2 Wrapper: `Renderer` module — scoped make (`acquireRelease` around dispose), async init as Effect with pipeline pre-warm, tagged errors
- [x] 1.3 Wrapper: `PostProcessing` (RenderPipeline + TSL pass/dof) and `Line2` modules
- [x] 1.4 Renderer: retained entity render contract — `build`/`update`/`dispose` + billboard flag, type-level exhaustive over built-ins (successor to `PaintFunctions`); loud defect on unregistered entity; custom entities register through the same shape
- [x] 1.5 Renderer: the retained renderer service (long-lived scoped) — frame walk (visibility, group translation-composition, cycle defects), retained diff (skip-unchanged, dispose-departed), coordinate mapping, camera sync; ThorVG stack untouched alongside
- [x] 1.6 Shape ports: Circle, Ellipse, Rect/Square (billboard + tilted), Line, Path (stroke polylines), Group; world-unit strokes; spike-grade canvas-texture Text carried over as an interim (replaced in stage 4)
- [x] 1.7 DoF post chain: bypass at aperture 0, per-pixel dof node with calibrated focus/ramp/bokeh mapping; background + frame-meta viewport per frame
- [x] 1.8 Deterministic transparency order: stable id `renderOrder` for translucent content
- [x] 1.9 Structural tests: retained-graph diff assertions (create/update/dispose, transforms, materials, render order) in vitest — no pixel assertions
- [x] 1.10 Rewire `@effect-motion/react` player onto the new renderer: per-player scoped renderer with pre-warm, status reflects renderer init, drop wasm-location option; keep latest-frame-wins and typed props
- [x] 1.11 Docs site: side-by-side three-vs-ThorVG verification page over the example scenes (temporary, dies in stage 3); verify flat-2d identity, bezier-3d, camera fly-through, WebGL2 fallback (document if broken)

## 2. Node entry + export (stage 2)

- [x] 2.1 `/node` entry: Dawn device acquisition (core feature level), `navigator`/rAF/`self` shims, stub canvas; keep `.` entry free of `node:*` and Dawn imports
- [x] 2.2 Readback as Effect: render through the pipeline (sRGB), destride 256-byte rows → display-ready RGBA; PNG encode
- [x] 2.3 Rewire `@effect-motion/export` `Video.render`: three Node renderer provided internally, readback→PNG→ffmpeg; export ships without DoF (Dawn TSL bug) — document loudly
- [ ] 2.4 File the upstream three.js issue for the Dawn TSL DoF collapse (repro from spike `headless.mjs`); link it in a `ponytail:` marker at the export DoF gate
- [x] 2.5 Headless smoke tests in CI: render real frames via Dawn, assert structure + loose visual sanity (never byte equality); verify linux x64 Dawn prebuilds early
- [x] 2.6 CLI `motion render` + studio verified end-to-end on three

## 3. Delete ThorVG + core render layer (stage 3 — point of no return)

- [x] 3.1 Land the camera schema in its three-native shape (design D4): redefine fields as convenient, keep z=0 identity + AE focal default; shrink `Projection` to camera resolution; update camera helpers/tests
- [x] 3.2 Delete `packages/thorvg`; drop `@effect-motion/thorvg` from all package.jsons and the changeset config
- [x] 3.3 Delete core's render layer entirely (`Renderer.ts`, `render/` shapes/paint/dof, the render error channel, the thorvg dep) — core ships renderer-free; migrate anything still importing the old surface to `@effect-motion/renderer`
- [x] 3.4 Remove the docs side-by-side page and ThorVG examples wiring; update `AGENTS.md`/`CLAUDE.md` architecture sections (renderer story, stale SVG-sink text)
- [x] 3.5 Full-repo `pnpm build && pnpm check && pnpm test && pnpm lint` green with thorvg gone

## 4. SDF text (stage 4)

- [x] 4.1 Validate troika-three-text on WebGPU + Dawn early (spike-sized); fall back to an alternative SDF atlas path if it fails headless — VERDICT: stock troika unusable on WebGPU (GLSL-derived material) and Node (canvas-bound atlas); its typesetting layer (getTextRenderInfo/GlyphsGeometry) is reusable. Fallback choice recorded in design.md
- [x] 4.2 Text entity port: SDF rendering, embedded default font shipped with the package, custom `Font` resource bytes resolved; keep the `font-loading` loud-defect backstop
- [x] 4.3 Anchor/baseline semantics from real metrics; billboard + perspective scaling; delete the interim canvas-texture text
- [x] 4.4 Text rendered identically-looking in browser and Node (structure tests + headless smoke)

## 5. Comps + remaining shapes (stage 5)

- [x] 5.1 Sized-group comps via render targets: clip, background, group opacity on the composite; unsized groups stay coordinate-only
- [x] 5.2 Images as textures: decode once per renderer scope, dispose on close, natural-size/explicit-size semantics
- [x] 5.3 Hud: screen-space pass on top, DoF-exempt
- [x] 5.4 Remaining geometry: group 2D transform matrices, rounded rect corners, path fills (tessellation), strokes on filled shapes
- [x] 5.5 Particles: instanced rendering strategy decided from stage-1/2 perf data; port ParticleField
- [x] 5.6 DoF-in-export follow-up gate: upstream fix or custom blur node; bokeh-stipple stress scene for thin translucent lines — CLOSED via a custom 17-tap level-0 gather blur (probe-proven under Dawn; three's dof node samples mips that collapse there); browser aperture mapping recalibrated to bokehScale = aperture against the old ThorVG sigma curve. ponytail: dedicated bokeh stress scene not authored — add one when DoF-heavy exports land
