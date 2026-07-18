# Design: render performance instrumentation + improvement plan

## D1. Where the time goes (the seam)

A rendered frame has exactly two phases worth separating, and they scale with
different things:

| phase | what it does | scales with |
| --- | --- | --- |
| `Renderer.compose` | flatten the instance tree → project each paintable through the camera → depth-sort → issue ThorVG paint calls (make shape, append geometry, style, set transform, add to scene) | **object count** (linear) |
| `Renderer.raster` | `Canvas.update/draw/sync` — ThorVG's software rasterizer fills pixels | **covered pixels × dpr²**, and **depth-of-field blur buckets** |

Splitting here is what makes the numbers actionable: a scene that's slow because
of *many objects* and a scene that's slow because of *many pixels* look
identical from the outside but want opposite fixes.

## D2. Why spans (the Effect timing primitive)

`Effect.withSpan` is the idiomatic timing primitive and the right tool over a
bespoke callback: it is hierarchical (compose/raster nest under render), it
carries attributes (`object_count`, `dpr`), and it composes with any real
tracer a downstream user already runs. When no tracer is installed Effect builds
a no-op span (a cheap object, no clock read on the hot path beyond the default
tracer's), so leaving the spans in the shipped renderer costs effectively
nothing. The benchmark installs a tiny collecting tracer (`PhaseCollector`) that
records each span's `endTime − startTime`; `TracerTimingEnabled` defaults on, so
the timestamps are real without any extra wiring.

`Effect.timed` still wraps each whole-frame render in the bench for the
wall-clock envelope (mean/p95/fps) — the spans attribute *within* that envelope.
The gap between the wall envelope and compose+raster is the fixed per-frame cost
(fresh scene + background rect + full-framebuffer `Uint8Array` copy) plus GC.

## D3. Measured cost model

Numbers below are from `pnpm bench` at 960×540, ThorVG SW engine, one dev
machine, node. They are **relative signal, not a spec** — the point is the
shape of each curve and comparing scenes, not absolute fps.

**Object count drives compose, linearly.** Raster barely moves; compose is the
whole story as objects climb:

```
grid  13 obj    compose 0.6ms · raster 1.7ms
grid  49 obj    compose 1.4ms · raster 1.8ms
grid 193 obj    compose 5.7ms · raster 2.6ms
grid 433 obj    compose 9.3ms · raster 3.9ms
```

**Camera rotation is ~free.** Identical 193-object geometry, only the camera's
`rotY` changes — compose is flat across poses; the small raster wiggle is
coverage, not trig:

```
rotY 0.0   compose 3.7ms · raster 2.4ms
rotY 0.5   compose 4.2ms · raster 1.7ms
rotY 1.0   compose 3.6ms · raster 1.7ms
```

**Coverage drives raster.** 12 large overlapping planes facing the camera vs
swung 0.6 rad away — same object count, ~3× the raster cost when they fill the
frame:

```
planes facing (rotY 0.0)   raster 4.6ms
planes swung  (rotY 0.6)   raster 1.6ms
```

**DPR is the biggest single multiplier — raster ∝ dpr².** The React player
rasterizes at *device* pixel ratio, so a retina display (dpr 2) already pays ~3×
the raster of the dpr-1 microbench before anything else:

```
dpr 1   raster  2.4ms   (total  7.7ms → 129 fps)
dpr 2   raster  7.9ms   (total 21.6ms →  46 fps)
dpr 3   raster 16.5ms   (total 29.1ms →  34 fps)
```

**Depth of field multiplies raster** (per-bucket gaussian passes). 48 rects,
same geometry, aperture swept:

```
aperture 0     raster 1.8ms
aperture 1.5   raster 2.1ms
aperture 3     raster 5.1ms
```

### What this says about the original report

"Rotating the camera dropped the frame rate" is real but the cause is not the
rotation math. The live player renders at device dpr (so raster is already
2–3× the numbers above), and rotating a coverage-heavy 2.5D scene swings large
planes/lines to fill more of the frame — and if depth of field is on, every one
of those pixels is blurred. Rotation is the trigger; **raster (pixels × dpr² ×
blur)** is the cost. The 2.5D system's *own* overhead — projection, tilted-plane
quads, near-plane clipping — is in the cheap compose phase.

## D4. Improvement plan (ranked, each paired with the bench that proves it)

Ordered by expected real-world playback impact. Each is a candidate follow-up
change; the bench scenario named is how we confirm the win (or kill the idea)
before and after.

1. **Cap the player's raster resolution.** *(raster; largest playback win)*
   Raster is dpr². The player currently rasterizes at full device dpr; a quality
   setting that clamps the render scale (e.g. dpr ≤ 1.5, or an explicit
   `renderScale`) trades edge crispness for a near-linear fps gain and is the
   single biggest lever for "playback feels slow" on retina. **Bench:** the dpr
   sweep — quantify fps at 1.0 / 1.25 / 1.5 / 2.0.

2. **Retained ThorVG scene graph.** *(compose; largest object-heavy win,
   biggest change)* Every frame rebuilds the entire scene graph from scratch —
   each paint fn calls `Tvg.Shape.make()` + re-appends geometry + re-styles, and
   the frame scene is scoped and deleted. For content that persists across
   frames (most of it), keep the ThorVG paints alive and update only transforms
   and dirty properties (ThorVG is a retained-mode renderer). This attacks the
   linear compose term at its root. Large: needs paint identity/lifetime across
   frames and a diff against the previous frame. Record as a `ponytail:` at the
   per-frame `Tvg.Scene.make()` site. **Bench:** the object-count sweep — compose
   should flatten from linear toward per-frame-delta.

3. **Viewport culling for billboards and planes.** *(both)* Lines already clip
   to the viewport (`clipSegmentToRect`); billboards and tilted planes do not —
   fully-offscreen paintables still get a shape made, styled, and painted. Cull
   paintables whose projected bounds fall entirely outside the frame before the
   paint loop: fewer C-API calls (compose) and less fill (raster). Camera moves
   that push content offscreen are exactly the 2.5D case. **Bench:** add a
   scene where a camera pan/rotate leaves half the objects offscreen; culled
   compose should drop with the visible count.

4. **Reduce per-node Effect overhead in `flatten`.** *(compose)* The flatten
   recurses through `Effect.gen` + `Effect.all(childIds.map(...))`, allocating a
   fiber and an array per container per frame. An iterative flatten (a plain
   stack/loop building the paintable list, matching the paint loop's own
   for-loop style) removes that per-frame allocation. Smaller and independent of
   #2. **Bench:** object-count sweep at high fan-out (deep Group trees).

5. **Precompute the camera view-rotation basis once per frame.** *(compose;
   small, safe)* `Projection.toView` recomputes `cos/sin` of the three camera
   Euler angles for every point — and for a tilted rect, four corners, so up to
   ~24 trig calls per rect. The camera angles are constant across the frame;
   compute the 3×3 inverse-rotation basis once and reuse. Low impact (rotation is
   already cheap) but removes obvious redundant work and is a pure, deterministic
   refactor. **Bench:** rotation sweep at high object count.

6. **Cheaper depth of field.** *(raster; only when aperture > 0)* Blur is
   already bucketed by quantized sigma. Further levers: lower the blur `quality`,
   rasterize blur buckets at reduced resolution and upscale, or cap bucket count.
   Author-owned today (opt-in via aperture). **Bench:** the aperture sweep.

Explicitly **not** worth it now: the O(n log n) depth sort (negligible at these
counts — already `ponytail:`-marked in `Renderer.ts`), and the whole-framebuffer
copy per frame (a few MB memcpy, dwarfed by raster).

## D5. Scope / non-goals

- This change adds the instrument and the plan. It does **not** implement any
  optimization — each item above is its own future change so its win is measured
  in isolation against the bench.
- The bench is a dev tool (SW engine, node, one machine): relative signal for
  comparing scenes and catching regressions, never an absolute-fps guarantee.
- No public API or determinism change. Spans are observability only.
