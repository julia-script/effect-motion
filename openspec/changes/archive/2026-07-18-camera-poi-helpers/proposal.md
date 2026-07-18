# Camera Point of Interest + Helpers

## Why

Directing the camera at something — looking at it, following it, orbiting it — currently requires hand-rolled per-frame trigonometry that is genuinely subtle: the view transform's z-flip inverts rotation handedness (a sign bug that shipped, briefly, in the bezier-3d docs example), and camera `x`/`y` are pan-from-viewport-center rather than world coordinates. That ~15-line footgun now lives in a docs example where users will copy it. After Effects — this camera model's stated reference — solves it with a two-node camera: position plus point of interest, orientation auto-derived. Adopting that model makes a whole class of orientation bugs unrepresentable and turns the helper vocabulary (`lookAt`, `follow`, `orbit`, `dolly`) into thin sugar over existing animators.

## What Changes

- **Camera gains an optional point of interest** — `poiX`/`poiY`/`poiZ` as plain numeric fields (tweenable/springable for free). When present, the camera auto-orients toward the POI and explicit Euler rotation composes *after* auto-orient (the AE rule, so `rotZ` dutch angles stay free). When absent, the camera behaves exactly as today (one-node; explicit opt-in per the library's defaults philosophy).
- **`Motion.drive`** — a public parametric animator: eased `t` per frame drives a whole-data update `(t, data) => data`, generalizing the per-frame `Scene.update` + `tick` loop. The primitive under `orbit` and available to users for any coordinated multi-field motion.
- **Camera helper vocabulary** (new `Camera` module surface):
  - `lookAt(target, duration?, timing?)` — no duration: set POI this frame; with duration: eased re-aim as a **retargeted tween** (each frame `poi = lerp(startPoi, target's current position, ease(t))`), converging exactly onto a moving target.
  - `follow(target, duration, timing?)` — per-frame POI copy for the duration; a plain animator that composes in pipes/`Scene.all`/`stagger` like any other.
  - `orbit(from, to, duration, timing?)` / `orbitTo(azimuth, duration, timing?)` — turntable arc around the POI: position travels the circle, POI pins orientation; azimuth-only in v1.
  - `dolly(from, to, ...)` / `dollyTo(distance, ...)` — move along the view axis toward/away from the POI.
- **Polymorphic targets with offset**: where a helper takes a target, it accepts an `Instance`, an `Effect<Instance>`, or a plain `Position`, plus an optional `offset` (added to the resolved target position — "look slightly above their head"). Instance targets are read live each frame; a plain `Position` is inherently fixed.
- **Naming rule recorded** (AGENTS deviation): verbs that name their target (`lookAt`, `follow`) carry no base/To pair — an optional duration selects instant vs eased. Value-animating helpers (`orbit`/`orbitTo`, `dolly`/`dollyTo`) keep the pair, because they animate a field-like value exactly as `moveTo` does.
- Docs: frame-ordering practice for `follow` (order in `Scene.all` is execution order; a mis-ordered follow is a deterministic 1-frame trail, not flakiness), plus a camera-direction example.

## Capabilities

### New Capabilities

- `camera-helpers`: the directing vocabulary — `lookAt`, `follow`, `orbit`/`orbitTo`, `dolly`/`dollyTo`; polymorphic targets (Instance / Effect / Position) with offsets; retargeted-tween semantics; the no-pair naming rule for target-naming verbs.

### Modified Capabilities

- `camera-3d`: the camera gains optional `poiX`/`poiY`/`poiZ`; when present, the effective view orientation is auto-orient-toward-POI composed with explicit Euler; absent POI preserves current behavior byte-for-byte.
- `tweening`: new `Motion.drive` parametric animator — eased scalar per frame applied through a whole-data callback, duration-exact like every timing-based animator.

## Impact

- `packages/motion/src/Camera.ts` — POI fields; helper animators (`lookAt`, `follow`, `orbit`, `dolly`).
- `packages/motion/src/Projection.ts` — pure look-at math: derive Euler orientation from position→POI (the z-flip handedness handled once, here).
- `packages/motion/src/Renderer.ts` (or Runner frame assembly) — resolve the effective camera view (auto-orient ∘ Euler) before projection.
- `packages/motion/src/Motion.ts` — `drive` primitive.
- Tests: look-at math, retargeting convergence, follow lag determinism, orbit identity (θ=0 = resting view), POI-absent regression (existing scenes byte-identical).
- Docs: bezier-3d example rewritten onto the new helpers (deleting the hand-rolled orbit loop); ordering-practice note.
- Out of scope, noted for later: full spherical orbit (elevation), `frameTo` (needs entity bounds), camera-on-Path (`moveAlong`, wants curve commands), a NULL/empty entity as a pure animation target.
