# Tasks: line-z2

## 1. Schema and lens

- [x] 1.1 Add `z2: defaultedNumber(0)` to Line's fields in `packages/motion/src/shapes/Line.ts`; update the endpoint comment (x/y/z start, x2/y2/z2 end)
- [x] 1.2 Update Line's `~position` lens `set` to shift `z2` by the z-delta (`z2: data.z2 + (value.z - data.z)`), matching x2/y2
- [x] 1.3 Extend `packages/motion/test/traits.test.ts`: moving a Line with a depth span via `moveTo` keeps z2 − z constant (spec scenario "Moving a Line in depth keeps it rigid")

## 2. Projection helper

- [x] 2.1 Add a segment near-plane clip to `packages/motion/src/Projection.ts`: given two view-space points, return the clipped pair against `NEAR` (lerp to z = NEAR), or none when both are behind; export a `projectSegment(camera, a, b, origin)` that returns the two projected screen points plus midpoint depth and midpoint scale
- [x] 2.2 Unit-test `projectSegment`: flat segment identity (z = 0 endpoints under resting camera project to authored coords), per-endpoint foreshortening, straddling clip, both-behind cull, midpoint depth/scale values

## 3. Renderer

- [x] 3.1 Add optional `segment?: readonly [Vec2, Vec2]` to `PaintProjection` in `packages/motion/src/Renderer.ts` (doc comment: exact screen endpoints for skeletal shapes)
- [x] 3.2 In flatten, when the leaf data has `x2`/`y2` (Line), call `projectSegment` on both world endpoints (compose ancestor offset into both, including z2 + offset.z); cull when clipped away; use midpoint depth as the paintable's depth and midpoint scale as its scale
- [x] 3.3 Add the `ponytail:` comment naming the one-key-per-segment ceiling and the bucket-boundary subdivision upgrade path (design D5)

## 4. Paint

- [x] 4.1 In `packages/motion/src/render/shapes.ts` line paint: when `projection.segment` is present, draw the two screen points directly, scale `strokeWidth` by `projection.scale`, and add to the scene without `finishPaint` (mirror the Rect quad branch)
- [x] 4.2 Renderer-level test: a receding line's projected endpoints differ in perspective scale; a flat line's output is unchanged from the pre-change baseline (identity invariant)

## 5. Docs and verification

- [x] 5.1 Record the two-tier positioning model (planar vs skeletal, uniform `~position`, no Eulers on skeletal shapes) in `AGENTS.md` alongside the existing API conventions
- [x] 5.2 Add a depth-grid example scene (`apps/docs/examples/`, registered in `registry.ts`): synthwave floor — cross lines at constant z plus z2 rails receding to the horizon, camera dolly with aperture > 0
- [x] 5.3 Run `pnpm --filter effect-motion test`, `pnpm check`, `pnpm lint:fix`; verify the scratchpad/example scene visually in the docs dev server (no NEW failures vs the pre-existing breakage baseline)

## 6. Segment viewport clipping (perf follow-up)

- [x] 6.1 Add `clipSegmentToRect` (Liang–Barsky) to `Projection.ts` — ThorVG stroke cost scales with full path extent, offscreen included (measured ~7× on a 15k-px projected line); unit tests for inside/crossing/spanning/outside cases
- [x] 6.2 Clip projected segments to the viewport plus a scaled-stroke margin in the renderer's skeletal branch; cull fully-offscreen segments; renderer tests (crossing line pixels unchanged, offscreen line paints nothing)
- [x] 6.3 Benchmark before/after: 10-line scratchpad frame 47.1 → 30.4 ms (extent cost eliminated); no new test failures vs baseline
