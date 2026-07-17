# Design: camera-depth-of-field

## Context

The camera is an ordinary entity (AE model: 50mm-equivalent focal default, Runner fills width-relative values at instantiate — `z`, `focalLength`). Projection hands every paintable `{ depth, scale }`; the renderer depth-sorts and paints far→near into one root ThorVG scene. `Scene.addGaussianBlur(scene, sigma, direction, border, quality)` is wrapped in `@effect-motion/thorvg` (scene-subtree effect, no callers yet). Engine track record demands spikes: three verified quirks so far (text nested-scene transforms, font unload NotSupported, `Picture.setSize` aspect preservation).

## Goals / Non-Goals

**Goals:**

- Author-driven focus: sharp plane + blur strength as tweenable camera data; rack-focus is a plain tween.
- Zero cost and byte-identical output for every scene that doesn't opt in (`aperture` 0).
- Deterministic: blur amounts are pure arithmetic on frame data; same frame → same pixels.

**Non-Goals:**

- Physically accurate lens models (thin-lens CoC with sensor sizes, bokeh shapes). One monotone AE-flavored curve.
- Per-pixel/per-particle DoF: one sigma per paintable (field/quad approximations documented).
- A player quality knob in v1 — cost is author-owned; knob is the recorded upgrade path if the spike numbers demand it.
- SVG-sink support (DoF is a ThorVG-renderer feature, like fonts/images).

## Decisions

### D1: Camera surface — `focusDistance` + `aperture`, AE naming

Two optionalKey numeric fields on the Camera entity. `focusDistance` is view-space distance to the sharp plane; the Runner fills its default with the resting camera distance (same mechanism as `z`/`focalLength`), so the z=0 plane is in focus for an untouched camera. `aperture` defaults to 0: pinhole, DoF off. *Alternative considered:* photographic `fStop` — inverse scale (smaller = blurrier) tweens unintuitively and breaks the "0 = off" default; AE's aperture-as-strength matches the established AE-parity model. No `blurLevel` multiplier (AE has one; aperture already spans the space — YAGNI). No `Camera.focusOn(instance)` helper in v1 (raw numbers + tweens; sugar can come later without spec impact).

### D2: Circle of confusion — one pinned formula

`sigma(depth) = aperture * focalLength * |depth - focusDistance| / (depth * focusDistance)` for `depth > 0`, clamped to a max sigma (defensive ceiling, e.g. 64). Properties that matter: zero exactly at the focus plane, monotone in `|depth − focusDistance|`, scales with aperture and focal length (longer lens = shallower field, matching intuition), and pure. The exact constants are calibration, not contract — the spec pins the properties, design pins the formula, and the docs show what values feel like. Behind-camera paintables are already culled before painting.

### D3: Blur-bucketed painting along the existing depth sort

With `aperture > 0`, the paint loop quantizes each paintable's sigma (steps of 0.5px; below 0.25 = sharp) and groups **contiguous runs** of equal quantized sigma: a run with sigma 0 paints into the root scene exactly as today; a blurred run paints into a fresh nested scene that gets `addGaussianBlur(sigma)` and is added to the root at the run boundary. Because runs are contiguous in the depth-sorted order, painter's order is preserved exactly; because sigma is quantized, the number of blur passes stays small (V-shaped sigma around the focus plane → typically 2–5 runs). With `aperture === 0` the loop is unchanged (no grouping, no nested scenes) — the no-op path is structural, not just numeric.

*Alternatives considered:* per-paintable blur scenes (exact, but one blur pass per paintable — recorded as the upgrade path if quantization banding ever matters, `ponytail:` at the site); post-process depth layers composited from separate framebuffers (far heavier, needed only for effects ThorVG can't express in-scene).

### D4: Spike gates (task 1)

**RESOLVED (2026-07-16), all three pass:** (a) a blurred nested scene blurs ONLY its subtree (root siblings keep hard edges, blur spills past the region's own bounds as expected); cost is **sigma-independent** — median over-baseline delta **~2.2 ms at 500×300 and ~6.5 ms at 875×525** per blurred region (half-canvas content, SW renderer, M-series laptop). Two blurred regions at player size ≈ 13 ms → the docs carry a "each blurred region costs ~6–7 ms at default player size; 2+ regions likely drops playback below 60fps; export unaffected" warning, per the no-knob stance. (b) translate-positioned text renders correctly inside a blurred sub-scene two levels deep — the one-level transform quirk does NOT extend; no text pinning rule needed. (c) verified against upstream + rendered output: `direction` 0 = both axes, `border` 0 = duplicate, `quality` 0–100 (75 = upstream default, used at our call site).

### D5: Where the code lives

CoC function + bucket grouping live in the renderer layer (`Renderer.ts` / `render/`), not `Projection.ts` — projection stays a pure geometry module; DoF is a paint-time concern reading `FrameMeta.camera`. Camera field fill lives in the Runner beside the existing `z`/`focalLength` fill. No thorvg package changes unless the spike wants named effect constants.

## Risks / Trade-offs

- [Blur pass too slow for 60fps playback] → Spike quantifies; v1 ships with measured numbers in the docs ("each blur region costs ~Xms at player size"). Export paths are frame-rate-free and unaffected.
- [Text vanishes inside blur scenes] → Spike rules it out or text pins to sharp/root buckets (documented: text never blurs — usually desirable anyway).
- [Quantization banding visible on smooth depth gradients] → 0.5px steps are below visible threshold for gaussian sigma in typical comps; per-paintable exact sigma is the recorded upgrade.
- [ParticleField / tilted quads span depth but get one sigma] → Documented approximation; per-particle DoF would need paint-fn-level support, out of scope.
- [Blur halos/clipping at bucket-scene bounds (`border` semantics)] → Spike (c); worst case the bucket scene gets padded bounds or the border mode that extends.

## Open Questions

- None blocking; D4's outcomes calibrate constants without changing the public surface (two camera fields, off by default).
