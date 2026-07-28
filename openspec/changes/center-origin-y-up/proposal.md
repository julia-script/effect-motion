# Proposal: center-origin-y-up

## Why

Scene space is currently y-down with the origin at the top-left — the SVG/canvas screen convention, inherited rather than chosen. For *animating*, it fights intuition: "move up" is `y: -100`, and authors get no free sense of symmetry from coordinates. Motion Canvas and Manim both center the origin for exactly this reason, and Manim's y-up matches how people sketch motion on paper. The library is unannounced and pre-1.0 (`effect-motion` 0.4.1), so this is the cheapest moment the breaking change will ever be.

## What Changes

- **BREAKING**: Scene space becomes **x right, y up, origin at the viewport center, +z toward the viewer** — a right-handed frame. Every authored position changes meaning.
- **BREAKING**: Positive rotation about z reads **counterclockwise** on screen (the math convention; it currently reads clockwise because y points down). Positive `rotX`/`rotY` visual directions flip accordingly.
- **BREAKING**: Rect, Square, and Image become **center-anchored** — `position` is the shape's center and rotation is about it — matching Manim and Motion Canvas (Circle and Ellipse already are; Text keeps its typographic `textAnchor`/`baseline` semantics; Line and Path are point-defined and unaffected). A corner/offset anchoring escape hatch is deferred to a later change.
- The renderer's scene→three mapping becomes near-identity (three is already y-up, center-origin): the y-flip and origin shift in `Sync.ts`, the object-rotation conjugation in `Builtins.ts`, and the camera-sync negations all disappear. Y-flips survive only at genuinely y-down boundaries (2D rasterization, text layout, pixel readback).
- Particle semantics keep their intent, re-expressed in the new frame: positive `gravity` still pulls toward the bottom of the screen (now −y); launch `angle: 0` still means straight up, with the positive direction pinned to match the new rotation convention (counterclockwise).
- Camera API is unchanged (pan-from-center, POI, orbit, dolly); only internal handedness signs (`lookAtOrientation`, orbit azimuth) are adjusted so behavior descriptions still hold.
- All core/renderer tests updated to the new frame. The 34 doc example scenes get a best-effort coordinate fix (the docs themselves are slated for a separate rewrite and are out of scope beyond keeping examples rendering sensibly).

## Capabilities

### New Capabilities

- `coordinate-system`: the authoring-space contract in one place — axes, origin, handedness, rotation direction, angle conventions, and the plain-2D identity invariant it implies. Today this contract exists only as scattered code comments and one line inside `motion-renderer`.

### Modified Capabilities

- `motion-renderer`: the "scene coordinates are y-down, top-left; renderer maps to three's space" requirement is rewritten — scene space now matches three's axes, and the requirement pins where y-flips remain (2D raster boundary, readback).
- `particle-system`: gravity and launch-angle direction semantics are currently unstated at the spec level; pin them explicitly in the new frame (positive gravity pulls screen-down, angle 0 = up, counterclockwise-positive).
- `shapes`: Rect/Square anchoring changes from top-left corner to center (position = center, rotation about center); anchor semantics are pinned at the spec level for every shape.
- `image-assets`: Image placement changes from top-left-anchored to center-anchored, matching Rect.

## Impact

- `packages/motion`: `Entity.ts` (Vec3 docs), `Projection.ts` (`lookAtOrientation` handedness, doc comments), `Camera.ts` (origin math is already center-based; orbit sign), `particles/step.ts` + particle doc comments, assorted TSDoc mentioning y-down.
- `packages/renderer`: `Sync.ts` (toThree mapping, camera sync, 2D-affine conjugation comments), `Builtins.ts` (rotation conjugation), `EntityRenderer.ts` (scene-space docs), text layout line stacking.
- Tests: ~23 files across `packages/motion/test` and `packages/renderer/test` with y-coordinate expectations.
- Docs: 34 `apps/docs/examples/*.scene.ts` (best-effort fix), MDX prose left for the planned docs rewrite.
- No dependency or public-API *shape* changes — only the meaning of coordinate values and rotation signs.
