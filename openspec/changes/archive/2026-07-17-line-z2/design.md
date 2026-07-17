# Design: line-z2

## Context

Every leaf shape is currently a billboard: one world anchor `(x, y, z)` is projected once, and `billboardAffine` maps the shape's local geometry to screen under a single uniform perspective scale. A Line's `x2/y2` live in that local space, so both endpoints ride the start point's depth. The one exception is the tilted Rect, which projects its four corners individually (`planeCorners` → `projectPlane`, near-plane-clipped) and hands the paint fn an exact screen polygon via `projection.quad`.

After Effects — this project's deliberate model for the camera and planar shapes — cannot express a segment between two 3D points at all: its "1 layer = 1 flat transformable plane" constraint is collateral from its raster/effects pipeline (a layer must be one texture + one transform for the effects stack to work). AE users escape via the Beam effect plus per-frame `toComp()` expressions. effect-motion is vector, schema-backed, per-shape-paint — it does not share the constraint that created AE's hole, so there is no fidelity reason to reproduce the hole.

## Goals / Non-Goals

**Goals:**

- A Line whose endpoints occupy independent 3D positions, projected correctly, animatable with the existing field animators.
- Preserve the identity invariant: a flat (z = z2 = 0) line under the resting camera renders exactly as today.
- Preserve `~position` rigidity: `move`/`moveTo` translate the whole line as one unit.
- Record the positioning model split explicitly so future shapes inherit a decision, not an inconsistency.

**Non-Goals:**

- Depth-strip subdivision (gradient blur / per-piece sort keys along one primitive) — recorded as the upgrade path, not built.
- Stroke taper under perspective (a receding line thinning toward the horizon). A thin tilted Rect already provides tapered rails where the aesthetic demands it.
- Interpenetration-correct sorting (split-at-intersection / BSP) — out of scope for the whole 2.5D pipeline.
- 3D Path (n-point polyline) — the natural follow-on; Line is its 2-point trial run.
- Orientation fields on Line — deliberately never (see the two-tier model).

## Decisions

### D1: Two-tier positioning model — planar vs skeletal

**Planar shapes** (Rect, Image, Text — anything with content on a flat extent) position as *anchor + Euler orientation*: the AE model, which is right for them because a plane has an identity separate from its extent, and Eulers animate cleanly. **Skeletal shapes** (Line; Path when it goes 3D) position *per point*: a segment IS its endpoints — there is no meaningful anchor/orientation decomposition an author thinks in. This mirrors SVG's own shapes-vs-path-data split, so it is a distinction motion-graphics authors already carry.

The confusion firewall: **the trait layer never shows the split**. `~position` moves any entity rigidly as one unit on every shape; only the raw field vocabulary differs per tier. And no shape speaks both dialects — Line never gets `rotX/rotY/rotZ`.

*Alternative considered — AE-pure (Line stays flat, helpers compute anchor/Euler/length from two 3D points):* rejected on animator commutation. Interpolating derived fields (angle, length) does not interpolate the endpoint — a tweened endpoint would sweep an arc instead of a straight line. Making it track straight requires re-deriving every frame, i.e. rebuilding AE's expression hack as the official API, against the library's declarative animator model. Also saves nothing: Line has no orientation fields today, so the schema surgery is the same size either way.

### D2: `z2` is absolute and defaults to 0, symmetric with `x2/y2`

Raw fields become fully symmetric: `x/y/z` = start, `x2/y2/z2` = end. Consequence: tweening raw `z` alone now tilts the line in depth (moves start only) — exactly how raw `x` already behaves (it stretches). The old behavior ("z moves the whole line") was a latent asymmetry, not a contract; no scene or test in the repo relies on it, and `moveTo` (the semantic verb) still moves the line rigidly.

*Alternative considered — optional `z2` meaning "same as z":* rejected; an absent numeric field is not tweenable, and the conditional semantics ("z2 tracks z until first touched") is exactly the kind of hidden mode this library avoids.

### D3: Unconditional per-endpoint projection, via a `segment` channel

Flatten projects both endpoints with the existing per-point `project` and emits `segment: [Vec2, Vec2]` on `PaintProjection`; the line paint fn draws those screen coords directly and skips `finishPaint` (mirroring the Rect quad branch). Unconditional — no `z !== z2` fast path — because the identity invariant makes the flat case bit-identical and one code path beats two.

*Alternative considered — reuse the `quad` channel with 2 points:* rejected; it would perturb quad's cull rule (`length < 3`) and overload "polygon" to mean "segment". A dedicated optional field is one line of type and keeps both meanings exact.

### D4: Near-plane clip the segment, don't cull

An endpoint behind the camera clips the segment against `NEAR` in view space (a linear interpolation to `z = NEAR` — the 1D case of the Sutherland–Hodgman clip `projectPlane` already runs). Whole-segment-behind culls. Matches plane behavior; whole-line culling on one bad endpoint would pop.

### D5: Midpoint depth for sort key and DoF bucket

One paintable, one key: the midpoint view depth serves both the painter's sort and the blur-sigma bucket. Same accepted ceiling the tilted quad already has (its anchor depth keys a depth-spanning polygon).

**The recorded upgrade path** (why this ceiling is a rung, not a wall): the DoF pass already quantizes depth into discrete sigma steps, and view depth varies *linearly* along a segment — so correct gradient blur is "split the segment where `z(t)` crosses each bucket boundary" (one linear solve per boundary), each sub-segment landing wholly in one bucket with its own sort key as a side effect. For quads the same upgrade is clipping against constant-depth planes — the existing `NEAR` clip pointed at `z = dᵢ`. Both upgrades are only possible because the model carries true per-point depth; userland projection would have forfeited them permanently.

### D6: Stroke width scales by midpoint perspective scale

A single stroke width scaled by the midpoint's `focalLength / depth`. Endpoint-scale averaging and taper are not attempted (see Non-Goals); the flat case is unaffected (scale 1 at z = 0 under the resting camera).

### D7: Future ancestor transforms compose pointwise — no hazard from this change

Everything downstream of flatten consumes world points: billboards reduce to 1, quads to 4 (corners), segments to 2. When group rotation/transform lands (Group already stores a normalized affine; flatten composes only translation today), the implementation is: accumulate a transform down the tree and apply it pointwise to whatever each shape reduces to. Skeletal shapes are the *easiest* case under that future (points are closed under affine maps); planes compose via their corners without Euler algebra; billboards under non-uniform scale are where the 2.5D compromise will be negotiated — orthogonal to this change.

## Risks / Trade-offs

- [Depth-spanning line blurs uniformly / can mis-sort against objects it passes through] → same ceiling as tilted quads; midpoint key minimizes it; `ponytail:` comment names the subdivision upgrade (D5). Triggering scene: a horizon-length rail under DoF.
- [Semantic break: raw `z` tween now tilts instead of translating] → no known usage (repo-wide check: only flat lines exist); `moveTo` unchanged; symmetry with `x` makes the new reading the *less* surprising one.
- [No taper: constant-width receding lines read slightly wrong for grid-floor aesthetics] → thin tilted Rect is the officially blessed primitive for tapered rails today; per-piece widths approximate taper once subdivision exists.
- [Model bifurcation confusing contributors] → the two-tier rule is stated in the spec delta and this design; guardrails: uniform `~position`, no Euler fields on skeletal shapes, no `z2`-style fields on planar shapes.

## Open Questions

None blocking. Deferred by decision: subdivision trigger point (first scene where uniform blur is visibly wrong), 3D Path (follow-on change).
