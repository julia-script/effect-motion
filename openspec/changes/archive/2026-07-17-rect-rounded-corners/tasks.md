# Tasks: rect-rounded-corners

## 1. Implementation

- [x] 1.1 `shapes/Rect.ts`: optional undefaulted `rx`/`ry` with the tilt-ignores-rounding note.
- [x] 1.2 `render/shapes.ts` rect paint fn: pass `rx ?? ry ?? 0` / `ry ?? rx ?? 0` to `appendRect` on the billboard path.
- [x] 1.3 Tests: rounded corner pixels background while edges/center filled; absent radii byte-identical; lone radius both axes; radii tween.
- [x] 1.4 Gates: lint, typecheck, tests — no new failures vs baseline. *(motion 239 pass + the 8 pre-existing; react clean; live-verified via the HUD example lower-third, which now uses rx: 12 — stroke-row geometry confirms the corner arcs at dpr.)*
