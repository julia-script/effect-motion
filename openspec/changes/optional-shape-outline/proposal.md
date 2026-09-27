## Why

Every `Rect`, `Circle`, `Ellipse` and `Path` drew a black 1-unit outline nobody asked for. The closed entity union (a46621e) gave all strokable shapes one stroke mixin defaulting `strokeColor` to black, which contradicts the shapes "Visible defaults" requirement (stroke absent) and the earlier Color-migration rule that stroke stays optional. Scenes worked around it with `strokeWidth: 0`, and a collapsed scale left a black bar (patched in c94b1bb by scaling the stroke — the symptom, not the cause).

## What Changes

- Filled shapes (`Rect`, `Circle`, `Ellipse`, `Path`) take an outline mixin: `strokeColor` is optional and absent by default, so they draw no outline unless the scene sets one. `strokeWidth` keeps its default of 1, so setting only `strokeColor` gives a 1-unit outline.
- `Line` keeps its own stroke mixin (black, width 1): a line is its stroke.
- Tweening `strokeColor` on a shape that never set it dies naming the field (existing behavior for any unset optional field); set a start color first.
- The shapes spec's stale defaults (fill black, SVG output) are corrected to the real ones (fill white, renderer draws no outline).

## Capabilities

### Modified Capabilities

- `shapes`: filled shapes have no default outline; Line keeps its default stroke.

## Impact

**`packages/motion`** — `Entity.ts`: `strokeColor` becomes `strokeColor?` on Rect/Circle/Ellipse/Path data. The renderer already skipped outlines when `strokeColor` is undefined.

**Rendering** — every unstroked filled shape loses its black 1-unit edge. On the docs examples this is edge-only (13/21 sheets differ, RMSE < 0.6%); scenes that wanted an outline already set `strokeColor`. `strokeWidth: 0` workarounds keep working.
