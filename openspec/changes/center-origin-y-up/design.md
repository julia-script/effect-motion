# Design: center-origin-y-up

## Context

Scene space today is x right, **y down**, origin at the **top-left**, +z toward the viewer — a left-handed frame inherited from SVG/canvas. The convention is spec-stated only in `motion-renderer` (spec.md line "Scene coordinates remain y-down…"); everywhere else it lives in code comments (`Entity.ts` Vec3 docs, `Sync.ts:79`, `Builtins.ts:31`). Three.js is y-up and center-friendly, so today the renderer conjugates: origin shift + y-flip in `toThree` (`Sync.ts:233`), camera negations (`Sync.ts:281-282`), object-rotation conjugation `R_three = Rz(-rz)·Ry(ry)·Rx(-rx)` (`Builtins.ts:259`), and a 2D-affine conjugation for composites (`Sync.ts:588`).

Separately, Rect/Square/Image are top-left-anchored through a shared corner-translated `unitPlane` (`Builtins.ts:33-34`); Circle/Ellipse are already center-anchored; Text is baseline-left by font metrics (spec-pinned in `three-text`).

The library is unannounced, 0.4.x; breaking changes are free. Docs prose is slated for a rewrite and out of scope; the 34 example scenes get a best-effort coordinate fix.

## Goals / Non-Goals

**Goals:**

- Scene space becomes **x right, y up, origin at viewport center, +z toward viewer** — right-handed, axis-identical to three.
- Positive rotations follow the right-hand rule (rotZ reads counterclockwise on screen).
- Rect/Square/Image become center-anchored; rotation is about the center.
- One spec (`coordinate-system`) states the frame contract; renderer/particle/shape specs reference it instead of restating it.
- Y-flips survive only at genuinely y-down boundaries (font metrics, texture/pixel readback), each with a comment naming the boundary.

**Non-Goals:**

- No corner/offset anchoring escape hatch (Motion Canvas `offset`-style) — a later change if wanted.
- No docs prose rewrite; MDX text that says "top-left" is corrected only where it sits next to a fixed example.
- No API *shape* changes: no renames, no new fields, no Settings knob for the convention (one frame, not configurable).
- Text keeps typographic `textAnchor`/`baseline` semantics (baseline-left default) — unchanged.

## Decisions

### D1 — One fixed frame, not a configurable one

A `Settings.yUp` flag would double the test matrix, force every doc example to declare its convention, and push branches into lenses, particles, and text forever. The library picks one frame, like Manim and Motion Canvas do. Alternative (config) rejected as a permanent complexity tax for a preference.

### D2 — Scene space = three space (axes and origin)

With y-up + center origin, `toThree` becomes the identity (`Vector3(x, y, z)`), camera sync loses its negations, and the object-rotation conjugation in `Builtins.ts` disappears (`rotation.set(rotX, rotY, rotZ)`, order "ZYX" retained). The mapping layer stays as a named seam (`ctx.toThree`) so the boundary remains explicit and greppable, but it no longer transforms. Alternative — keeping scene space y-down and flipping only in the authoring layer — rejected: it would leave two frames alive inside the codebase.

### D3 — Projection origin becomes (0, 0); drop the origin parameter

`Projection.project`/`toView`/`resolveCamera` take an `origin` (viewport center) solely because the authoring origin was the corner. With a center origin the parameter is always zero: remove it rather than thread a constant. `Camera.ts` sheds its `width / 2` compositions. The identity invariant survives verbatim: the default camera projects a world point at z=0 to screen (x, y) at scale 1 — "plain 2D" now means center-origin placement.

### D4 — Handedness falls out of the existing math

`rotate`/`rotateInverse` in `Projection.ts` are already canonical right-handed matrices; in a y-down frame they *display* as clockwise. Flipping the frame makes them display counterclockwise with no formula change. The places that hand-compensated for left-handedness get re-derived instead of sign-patched blindly: `lookAtOrientation` (the `rotX = -asin(dy/len)` sign), orbit azimuth in `Camera.ts`, and the POI-projects-to-center tests are the pin that proves them.

### D5 — Center anchoring via the shared geometry

Remove `unitPlane.translate(0.5, -0.5, 0)` so the unit plane is centered like `unitCircle` already is; recenter `rectPoints` outline geometry to ±w/2, ±h/2. Rotation about the center then falls out of the group transform with no extra work. Image uses the same plane and inherits the fix. Sub-composition composite planes (`Sync.ts` comp placement, currently "top-left-anchored plane") center-anchor too — a comp places like an Image of its own size. Alternative — anchor math in the update functions per shape — rejected: the geometry is the single shared place.

### D6 — Particle semantics keep author intent, re-expressed

- `gravity > 0` still pulls toward the bottom of the screen: integration becomes `vy -= gravity * dt`. The word "gravity" should keep meaning gravity.
- Launch `angle: 0` still means straight up (+y now); positive angle is **counterclockwise**, matching the rotation convention (currently documented clockwise-positive — this flips, and symmetric ranges like `[-15, 15]` are unaffected, which is the common case).
- `fill` emission's default whole-frame region becomes x ∈ [−w/2, w/2], y ∈ [−h/2, h/2]; wrap logic adjusts to signed bounds.
- The RNG draw *sequence* (angle, speed, life, size, color) is untouched, so seeded streams stay stable; only the interpretation of drawn angles changes.

### D7 — Where y-flips remain (each with a boundary comment)

1. **Font metrics / text layout** (`renderer/Text.ts`): font engines measure y-down; glyph quads flip once where they're placed. Multi-line text still stacks visually downward (line 2 at `y = -lineHeight` internally).
2. **Texture/UV space** for images: three handles UV orientation; no change expected, verified by an asymmetric-image test.
3. **Pixel readback** (Node PNG adapter / `readRenderTarget`): scanline order is a raster convention, unchanged.

Nothing else may flip. A grep for `-y`/negation near the seams is part of review.

### D8 — Migration is mechanical, applied with intent

For any existing scene: `x' = x − width/2`, `y' = height/2 − y`, `rotZ' = −rotZ` (visual preservation), rect/image positions additionally shift by `(+w/2, −h/2)` for the anchor change. Tests are updated by re-deriving expectations (many become symmetric and *nicer*); example scenes are fixed best-effort with the same rules, preferring round centered values over exact transliteration.

## Risks / Trade-offs

- **[Double-flip bugs at the text/raster seams]** → single conversion point per boundary (D7), plus a test using an asymmetric glyph layout and an asymmetric image so a stray flip can't cancel out.
- **[Hand-compensated signs lurking beyond the known spots]** (orbit, lookAt, DoF focus plane) → re-derive rather than sign-patch; the POI-centering, orbit-turntable, and identity-invariant tests are the safety net; a full-suite visual pass over the 34 examples in the studio before archive.
- **[Rotation direction silently changes the look of existing scenes]** → accepted and intended (breaking change); the migration rule `rotZ' = −rotZ` is documented for the examples.
- **[Test churn noise hides real regressions]** → convert tests file-by-file, re-deriving each expectation from the new frame rather than mass-negating, so a wrong sign can't survive as "matched churn".
- **[Comp/HUD tiers drift from world convention]** → both explicitly included: HUD is center-origin y-up (its identity camera already is, once `toThree` is identity), comps center-anchor (D5).

## Migration Plan

Single atomic change — no dual-convention period, no deprecation. Order: core math (Projection/Camera) → renderer (Sync/Builtins/Text) → particles → tests per package → example scenes. `pnpm check && pnpm test` green at each stage boundary; visual spot-check of examples last. Rollback is `git revert` of the change; nothing external depends on the library yet.

## Open Questions

- None blocking. The corner/offset anchoring escape hatch and any `fromEdge`-style placement helpers are explicitly deferred; file a follow-up change when a real scene needs them.
