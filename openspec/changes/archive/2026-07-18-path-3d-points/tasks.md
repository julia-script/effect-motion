# Tasks: path-3d-points

## 1. Schema

- [x] 1.1 Replace `d: Schema.String` with `points: Schema.Array(PathPoint)` in `packages/motion/src/shapes/Path.ts`, where `PathPoint` is `{ x: Number, y: Number, z: optionalKey(Number) }` (design D2); document anchor-relative semantics (design D3)
- [x] 1.2 Add `closed: Schema.Boolean` (constructor default `false`)
- [x] 1.3 Update the schema default test in `test/shapes.test.ts` (points required, closed false, z omitted stays omitted)

## 2. Projection

- [x] 2.1 Add `projectPath(camera, points, closed, origin)` to `Projection.ts`: per-vertex projection, stroke runs split at near-plane crossings (with ring-seam stitch), Sutherland–Hodgman fill contour, mean-contour depth/scale, all-behind cull (design D4, D5)
- [x] 2.2 Add `clipPolygonToRect` (rect Sutherland–Hodgman) and `clipPathToRect` (fill via polygon clip, runs via per-edge `clipSegmentToRect` with run splitting and ring-seam stitch; fully-inside fast path returns the input untouched) (design D6)
- [x] 2.3 Unit tests: flat identity, per-vertex foreshortening, all-behind + empty cull, middle-vertex run split, clipped-ring seam stitch, bit-for-bit determinism

## 3. Renderer

- [x] 3.1 Add optional `path?: Projection.ProjectedPath` to `PaintProjection`
- [x] 3.2 In flatten, a leaf with a `points` array projects via `projectPath` (world = ancestor offset + anchor + point, `z` read as 0 when omitted), then viewport-clips via `clipPathToRect` with the scaled-stroke margin; cull on undefined from either stage
- [x] 3.3 `ponytail:` comment naming the one-key-per-path ceiling and the bucket-boundary subdivision upgrade

## 4. Paint

- [x] 4.1 `path` paint fn in `render/shapes.ts`: unclipped → one shape (closed as authored, fill+stroke, width × perspective scale); clipped → fill-only shape from the contour + stroke-only shape from the runs (design D7); registered in `builtinPaints`, "Path omitted" carve-out comment removed
- [x] 4.2 Renderer-level tests (`test/path-depth.test.ts`): flat identity invariant, anchor translation, per-point foreshortening (mirrors the Line rail case), fully-behind cull, straddling fill clipped to the visible side
- [x] 4.3 Path joins the painted-builtins manifest check in `test/shapes.test.ts`

## 5. Docs and verification

- [x] 5.1 Update AGENTS.md skeletal-tier wording (Path is skeletal now, not "when it goes 3D"; note the anchor-relative point convention)
- [x] 5.2 Run motion tests, `pnpm check`, `pnpm lint` — no new failures vs the pre-existing baseline (phaser deadlock, 8 unsafe-optional-chaining lint errors); repo-wide `d:` usage check (none outside the replaced test)
