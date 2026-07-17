# Proposal: line-z2

## Why

A `Line` carries one `z` for both endpoints (its schema has `x/y/z` + `x2/y2`, no `z2`), so a line cannot span depth — the receding "rails" of a 3D grid floor, or a connector between two objects at different depths, are unsayable. Working around it with userland projection destroys depth truth entirely: hand-projected flat lines sit at `z = 0`, sort at the screen plane, and take the focus plane's sharpness under depth of field. The renderer can only ever be as depth-correct as the data model lets it see.

## What Changes

- `Line` gains a `z2` field (default 0), making its endpoints fully symmetric: `x/y/z` is the start point, `x2/y2/z2` the end point, all raw-tweenable.
- The renderer projects a Line's two endpoints independently (per-point `project`, near-plane segment clip) and paints the exact screen segment — the same move the tilted-Rect quad path already made for planes. The per-endpoint path is unconditional: the identity invariant guarantees flat lines render pixel-identically.
- Line's `~position` lens shifts `z2` by the z-delta (as it already does `x2/y2`), so `move`/`moveTo` keep moving the whole line rigidly. This also fixes a latent asymmetry: the lens currently *replaces* `z` while *shifting* `x2/y2`.
- A depth-spanning segment sorts and DoF-buckets by its **midpoint** view depth — one key per paintable, same ceiling the tilted quad already has (documented `ponytail:` with the subdivision upgrade path).
- The two-tier positioning model is recorded as a stated design principle: planar shapes position as *plane + orientation* (the AE model), point-defined shapes position *per point*; the `~position` trait moves any entity rigidly regardless of tier.
- **BREAKING** (semantic, no known usage): tweening raw `z` on a Line now moves only the start point (tilting the line in depth) instead of the whole line — symmetric with how raw `x` already behaves. `moveTo` behavior is unchanged. No scene or test in the repo relies on the old reading.

## Capabilities

### New Capabilities

None — this extends existing capabilities.

### Modified Capabilities

- `shapes`: the `Line` entity's field set gains `z2` (symmetric endpoint fields).
- `object-depth`: point-defined (skeletal) shapes carry per-point depth and render as independently projected segments rather than billboards; segment depth key and near-plane clipping defined.
- `traits`: Line's `~position` rigidity contract extends to depth — `set` shifts `z2` by the z-delta alongside `x2/y2`.

## Impact

- `packages/motion/src/shapes/Line.ts` — schema field + lens.
- `packages/motion/src/Renderer.ts` — flatten emits a projected 2-point segment for Line (new optional `segment` on `PaintProjection`); midpoint depth key; near-plane segment clip (small helper in `Projection.ts`).
- `packages/motion/src/render/shapes.ts` — line paint draws screen coords directly when a segment is present (skips `finishPaint`, like the Rect quad branch); stroke width scaled by midpoint perspective scale.
- Animators: none — `tweenTo(line, { x2, y2, z2 })` works on any numeric field already.
- Docs: the scratchpad grid scene becomes expressible; a depth-grid example can follow separately.
- Known accepted ceilings (unchanged from tilted quads): uniform blur per primitive, single sort key, no stroke taper. Upgrade path (depth-strip subdivision at blur-bucket boundaries) recorded in design.md, not built now.
