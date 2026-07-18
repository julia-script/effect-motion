# Tasks — Path 3D Commands

## 1. Schema

- [x] 1.1 Rewrite `packages/motion/src/shapes/Path.ts`: `MoveTo`/`LineTo`/`Close` TaggedStructs (`x`/`y` required, `z` optionalKey), `PathCommand` union, `commands: Schema.NonEmptyArray(PathCommand)` with a filter requiring the first command to be `M`; drop `d`; keep `Shape2D.filled` + `positionLens`/`opacityLens`. Export the command schemas.
- [x] 1.2 Smoke-test the schema shape under the pinned effect beta: instantiate a Path via `Scene.instantiate` with literal commands (with and without `z`), assert a non-`M` first command and a `d` property both fail loudly.

## 2. Projection

- [x] 2.1 In `packages/motion/src/Projection.ts`, extract the Sutherland–Hodgman near-clip + per-vertex divide from `projectPlane` for reuse, and add `projectPath(camera, subpaths, origin)` → screen subpaths + mean-visible depth + scale (open subpaths: per-span clip with splitting; closed: polygon clip; all-behind: `undefined`).
- [x] 2.2 Unit tests: flat path identity (all z=0, resting camera → input coordinates unchanged), per-point foreshortening, open-subpath split when an interior point is behind the near plane, closed-subpath clip, full cull, mean-depth key, determinism (bit-identical repeat).

## 3. Renderer flatten

- [x] 3.1 In `packages/motion/src/Renderer.ts`, add the path-leaf branch (a leaf carrying an array `commands` field, ahead of the `x2`/`y2` sniff): split commands into subpaths at `M`/`Z`, resolve world points (anchor + local, `z ?? 0`), call `projectPath`, cull on `undefined`, push a paintable whose projection carries `subpaths` (new optional field beside `quad`/`segment`) plus depth/scale/screen affine.
- [x] 3.2 Note the deferred viewport clip with a `ponytail:` comment (ceiling: ThorVG stroke cost on huge offscreen extents; upgrade: per-span `clipSegmentToRect` with the same splitting).

## 4. Paint

- [x] 4.1 In `packages/motion/src/render/shapes.ts`, add the `path` paint function: one `Tvg.Shape`, per subpath `moveTo`/`lineTo`(+`close` when closed) at screen coordinates, `applyStyle`, stroke width × `projection.scale`, add to scene with no transform. Register in `builtinPaints` and its type union; delete the "Path is omitted deliberately" comment block.
- [x] 4.2 Render tests (pixel probes, matching existing renderer test style): flat closed path fills; depth-spanning open path foreshortens; path straddling the near plane renders only visible pieces; Path renders with no consumer paint functions provided.

## 5. Integration & docs

- [x] 5.1 Sweep the repo for `Path` usages of `d` (docs examples, demo scenes, tests) and update or remove them; add/refresh a runnable example in `apps/docs/examples/` + `registry.ts` showing a 3D polyline path.
- [x] 5.2 `pnpm lint:fix && pnpm check && pnpm test` — green against the pre-existing-breakage baseline (no NEW failures).
