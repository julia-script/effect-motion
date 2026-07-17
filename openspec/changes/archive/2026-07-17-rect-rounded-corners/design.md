# Design: rect-rounded-corners

## Context

`Tvg.Shape.appendRect(shape, x, y, w, h, rx = 0, ry = 0)` already exists; the rect paint fn simply doesn't pass radii. Rect has two paint paths: billboard (appendRect + projection affine) and tilted quad (exact projected polygon).

## Decisions

- **`rx`/`ry` optionalKey numbers, no defaults** — matches SVG naming, matches the repo's absent-means-omitted convention (`stroke`, Image's `width`/`height`), and keeps them tweenable when set. A lone radius applies to both axes (SVG semantics): `rx ?? ry ?? 0` per axis at paint time.
- **Tilt ignores rounding** — the quad path emits a 3–5 vertex polygon from projected corners; rounding it would need projected arc math for marginal value. Documented on the entity; a tilted rounded Rect renders with sharp corners rather than dying (rounding is styling, not placement — soft degradation matches the fonts/images precedent).
- No clamping beyond ThorVG's own behavior (the engine caps radii at half-extents, standard rounded-rect semantics).

## Risks / Trade-offs

- [Engine radius semantics differ from SVG at extremes] → the framebuffer test pins corner-pixel behavior at a normal radius; extremes are engine territory.
