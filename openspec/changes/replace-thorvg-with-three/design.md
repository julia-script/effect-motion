# Design: replace-thorvg-with-three

## Context

ThorVG is not a plugin today — it is the core's render layer. `effect-motion` depends on `@effect-motion/thorvg`; `Renderer.ts` (935 lines) carries `ThorvgException | ThorvgWasm | RenderSession` in its public signatures; `render/shapes.ts` + `render/paint.ts` + `render/dof.ts` are ThorVG paint code; the react player provisions the wasm engine directly; export renders through `EngineNode`.

The spike (`openspec/changes/archive/2026-07-19-threejs-renderer-spike/`, code in the spike worktree at `apps/docs/lib/three-spike/`) proved the replacement renderer, and showed the rewrite is contained: the spike sink needed only `Scene.Frame` values, `Color`, and `Projection.resolveCamera` — the frame stream already carries everything a renderer consumes.

Constraints carried in from AGENTS.md and the spike findings:

- Determinism stops at the frame stream (same seed/settings → same frame count and frame data; browser vs headless should *look* the same). Pixel/byte-exact rendered output is explicitly not a goal.
- z=0 content with an untouched camera must land where authored (the 2D identity invariant); the spike's `flat-2d` scene confirms three degrades cleanly to plain 2D.
- No backward-compatibility obligations: the camera model and any API shaped by ThorVG may change to whatever is convenient for three.
- World-unit perspective-correct strokes are a port *motivation* — the visible change to existing scenes is desired.

## Goals / Non-Goals

**Goals:**

- One renderer: `@effect-motion/renderer`, browser (WebGPU, WebGL2 fallback) and Node (Dawn) from the same code.
- A three-layer split: core (scenes → frames, no renderer dependency at all) ← `@effect-motion/renderer` (frames meet three) → `@effect-motion/three` (bindings-only wrapper, knows only three).
- An idiomatic-Effect wrapper over three that mirrors three's own API names closely and covers only what the renderer uses, grown lazily.
- Player and export parity with today (export minus DoF until the Dawn issue is resolved), then text, then comps.
- Each migration stage is shippable; ThorVG is deleted only after player and export both run on three.

**Non-Goals:**

- Wrapping three's full API surface in Effect.
- Pixel-identical output vs ThorVG (stroke rendering and DoF intentionally differ) or byte-stable GPU output across machines.
- A second/pluggable sink abstraction — this is a replacement, one renderer again.
- Lights/PBR/true-3D authoring features beyond what the 2.5D model already implies (three makes them *possible* later; not in scope now).

## Decisions

### D1 — Three-layer split: frames-only core, renderer package, bindings-only wrapper

Three packages with one dependency direction each:

- `effect-motion` (core): scenes, entities, frame production. Loses its renderer dependency entirely — no three (and no thorvg) in its tree, no render error channel. The frame stream (+ `Color`, camera resolution) is its renderer-facing contract; the spike confirmed nothing more is needed.
- `@effect-motion/three`: a bindings-only Effect wrapper that knows only three.js — no `effect-motion` dependency; it never sees frames, entities, or projection (mirroring `@effect-motion/thorvg`'s bindings-only contract).
- `@effect-motion/renderer`: the only place frames meet three. Depends on both core and the wrapper; owns the retained renderer — a long-lived scoped service holding the retained three scene across frames rather than a per-frame paint pass — plus the entity render contract, DoF, and the browser/Node adapters. Player, export, and CLI depend on it.

Alternatives considered: renderer inside core consuming the wrapper (today's thorvg hierarchy) — rejected because it forces three into every core consumer's tree for no benefit; renderer merged into the `@effect-motion/three` package — rejected because it destroys the wrapper's bindings-only reusability and mixes two very different kinds of code (domain mapping vs bindings).

### D2 — The wrapper: Effect at the seams, raw three in the hot path

The wrapper (modeled on `@effect-motion/thorvg`'s pattern) mirrors three's names and puts Effect where lifecycle, async, and failure live:

- `Renderer` (WebGPURenderer): `make` → scoped Effect (`acquireRelease` around `dispose`), `init`/`render`/readback as Effects. Init also pre-warms pipelines (spike: ~80ms first-frame compile).
- `PostProcessing`: `RenderPipeline` + TSL `pass`/`dof` nodes.
- `Line2` / `LineGeometry` / `Line2NodeMaterial`, and thin modules for Mesh/Material/Geometry/Texture as needed.
- `node.ts` entry: Dawn device acquisition (self-requested core-feature device — three requests `featureLevel: 'compatibility'`), `navigator` (getter-only in Node 24 → `defineProperty`), rAF and `self` shims.

The per-frame retained diff (`position.set`, material mutation) stays raw three inside the renderer package — wrapping per-object mutation in Effect would fight the retained model and the performance that motivated the port. Coverage grows lazily: wrap what we use, when we use it.

### D3 — Entity render contract: retained `build`/`update`/`dispose` in the renderer package

The immediate-mode `PaintFunction` contract dies with ThorVG. `@effect-motion/renderer` owns the contract, keyed by entity name: each entry provides `build(leaf) → { object: Object3D, dispose }`, `update(retained, leaf)`, and a billboard flag (the spike's `Retained` interface, promoted to the contract). Built-in shape coverage stays a type-level guarantee (the renderer's manifest imports the built-in entity types from core and must cover them exhaustively, as `PaintFunctions` does today); custom entities — defined in userland via core's Entity API — register their render implementation with the renderer package through the same shape.

### D4 — Coordinate space and camera

Scene space stays y-down/top-left with +z toward the viewer; the sink maps to three (shift origin to viewport center, flip y) exactly as the spike derived and verified. The camera schema is redefined in three-convenient terms — the goal is to dissolve the Euler-conjugation dance (`Rz(-rz)·Ry(∓ry)·Rx(±rx)`) rather than preserve it: if camera data is stored in (or trivially adjacent to) three's conventions, `Projection.resolveCamera` shrinks or disappears. Preserved regardless: the z=0 identity invariant and the AE-style focal-length default (`width×50/36`), with `fov = 2·atan(h/2f)` derived. Exact schema shape is decided during implementation — core adapts to the renderer, not vice versa.

### D5 — Strokes, depth, billboards

- Strokes: `Line2NodeMaterial` with `worldUnits: true` is *the* semantics. No ThorVG-compat mode. Screen-space widths can be a later per-stroke opt-in if a need appears.
- Depth: GPU z-buffer replaces the painter's-order draw list; coplanar translucent stacks get deterministic `renderOrder` from the existing stable id sort.
- Billboards: circles/ellipses/unrotated rects/text copy the camera quaternion per frame (spike-verified: circles stay circular through orbits). Rotated rects use the object-rotation mapping.

### D6 — DoF (revised in stage 5)

Three's TSL `DepthOfFieldNode` was abandoned entirely: it renders a single collapsed texel permanently under Dawn AND on its first frame in Chrome, and never resolved focus reliably in the browser (uniform blur at every depth). Both render paths now share a **custom level-0 scatter-as-gather blur** (`packages/renderer/src/dof.ts`): 97 taps on a Vogel spiral rotated per pixel by interleaved gradient noise (fixed-disc taps read as overlaid scene copies; the jitter dissolves them into grain), each tap weighted by whether the TAP's own CoC (per-tap depth linearized via the pass's near/far) reaches the center pixel — a naive equal-weight gather gives far-plane background max CoC forever, hauling sharp geometry into a permanent halo that never resolves with focus. Rejected taps fall back to the center color instead of renormalizing (renormalization boosts MSAA-tinted rim texels into speckle). Probe-verified: a focused subject renders sharp while near/far content blurs, in Chrome and under Dawn. Aperture 0 drives the CoC to zero (arithmetic identity); the browser path additionally bypasses the pipeline entirely at aperture 0. Aperture mapping derived from the ThorVG sigma curve: `strengthUv = 2·aperture / viewport height`. The spike's `bokehScale = aperture × 6` eyeball was wrong by roughly an order of magnitude on real scenes. The upstream-issue task (2.4) now has a sharper repro: their node collapses where a plain pass-through and this blur render correctly.

### D7 — Text via SDF

troika-three-text (WebGPU support landed upstream) replaces the spike's canvas-texture hack. Must resolve the engine's embedded default font and custom `Font` resources (fidelity the spike lacked), and reproduce anchor/baseline semantics and perspective font scaling. The `font-loading` contract retargets: consumers load declared fonts into the three text path instead of the ThorVG engine. Largest single work item; scheduled after the ThorVG deletion so it lands on the final architecture.

### D8 — Comps as render targets

Sized-group semantics (clip/background/transform/opacity over a subtree) map to nested render targets. Most structural of the remaining ports; last stage. Group translation-composition (spike behavior) covers untinted/unclipped groups until then.

### D9 — Export pipeline

`render → readRenderTargetPixelsAsync → PNG → ffmpeg`. Readback handles WebGPU's 256-byte row alignment (destride) and top-down rows; rendering through `RenderPipeline` applies the sRGB output transform so readback is display-ready (raw render-target readback is linear — always go through the pipeline). Readback being async allows pipelining frames where ThorVG rasterized serially; keep it serial first, pipeline as a follow-up if encode becomes the bottleneck.

One landmine, found post-stage-5: three advances `nodeFrame.frameId` only inside its rAF-driven animation loop (a 16ms setTimeout shim headless), never in `render()`. Exports rendering faster than that share a frameId, so FRAME-deduped nodes — the scene `PassNode` above all — skip their per-frame scene render and consecutive exported frames read a stale pass texture (pairwise-duplicated video frames; choppy motion at 60fps, half-rate at 120fps). The node adapter now ticks `nodeFrame.update()` explicitly per exported frame: one exported frame IS one three frame.

### D10 — Testing under the new determinism boundary

Frame-stream tests (count, data, seeded random) stay byte-exact in plain vitest. Renderer tests assert structure (retained scene graph contents, object transforms, material params) rather than pixels; headless Dawn smoke tests render real frames and assert "looks the same" loosely (e.g. coarse perceptual/statistical checks), never byte equality. No golden-image infrastructure.

## Risks / Trade-offs

- [Dawn/TSL DoF bug] → export ships without DoF; upstream issue filed; custom blur node as fallback. Browser DoF unaffected.
- [First-frame pipeline compile (~40–80ms) jank] → pre-warm during renderer init, before the player reveals the canvas.
- [DoF bokeh stippling on thin translucent lines] → known artifact; more samples / pre-blur MSAA resolve as tuning options; dedicated stress scene to keep it visible.
- [WebGL2 fallback untested] → treat WebGPU as the supported path; verify the fallback in stage 1 and scope-cut it explicitly if broken (document, don't silently ship).
- [`webgpu` (Dawn) npm prebuilds may lag platforms] → spike verified darwin arm64 only; check linux x64 (CI) early in stage 2.
- [Retained-diff correctness (stale objects, leaks)] → the registry contract requires `dispose`; structural tests diff retained maps across frames; `renderer.dispose` in scope teardown.
- [Deleting ThorVG is irreversible in-tree] → sequenced as its own stage after player + export run on three; git history preserves the package if archaeology is ever needed.
- [Path fills and strokes-on-filled-shapes were not spiked] → findings judged them not structurally hard; they ride in the final stage with comps — if tessellation (`ShapeGeometry`/`ExtrudeGeometry`) surprises us, it surfaces there, not on the critical path.

## Migration Plan

Five stages, each shippable (mirrors proposal Impact):

1. **Wrapper + renderer packages, browser path**: `packages/three` (bindings-only wrapper) and `packages/renderer` (retained renderer) stood up alongside the untouched ThorVG stack; react player runs on the new renderer; ThorVG kept for side-by-side verification in docs.
2. **Node + export**: wrapper `/node` entry (Dawn), export rewired to readback→PNG→ffmpeg (no DoF); CI runs headless render smoke tests.
3. **Deletion** (point of no return): remove `packages/thorvg` and core's entire render layer (`Renderer.ts`, `render/`, the thorvg dep, the render error channel); remove the ThorVG specs; camera schema lands in its three-native shape.
4. **Text**: troika SDF + Font resource fidelity; retarget `font-loading`.
5. **Comps + remaining shapes**: render-target comps, images, Hud, group transform matrices, rounded rects, path fills, particles.

Rollback: stages 1–2 are additive (revert the wiring commit). After stage 3, rollback is `git revert` of the deletion — acceptable given player + export must already pass on three to enter stage 3.

## Open Questions

- ~~Exact camera schema shape (D4)~~ — **resolved in stage 3: no schema change.** The existing fields (position, Euler, `focalLength`, focus) already map 1:1 onto three's camera; the whole conjugation is three sign flips in one function (`FrameSync.syncFrame`). Storing camera data in three's conventions would make the camera y-up amid y-down content — worse authoring ergonomics for zero simplification. `Projection` shrank to camera resolution plus pure point projection (kept for POI/identity tests).

- ~~troika-three-text WebGPU maturity~~ — **validated in stage 4 (task 4.1): troika 0.52.4 (latest; no newer dist-tag) cannot render under WebGPURenderer.** Its `Text` material derives GLSL via `createDerivedMaterial` (WebGL-only — incompatible with node materials), and its SDF atlas is built on a DOM canvas (`document.createElement('canvas')`), so the stock pipeline is also Node-hostile. What IS reusable: the public typesetting layer — `getTextRenderInfo` (font parsing via Typr, layout, SDF atlas + `glyphBounds`/atlas indices) and `GlyphsGeometry` (instanced glyph quads) — leaving a custom TSL node material (SDF sampling → edge alpha) and a headless atlas strategy as our work. Fallback selection is an open scope decision — see stage-4 pause.
- Whether `Projection` survives as a public module or shrinks to an internal camera helper.
- Particle rendering strategy (instanced mesh vs per-particle objects) — decide in stage 5 with the perf data from stages 1–2.
