# Design — Path 3D Commands

## Context

`Shapes.Path` today is `Shape2D.filled + d: Schema.String` with an x/y offset. It is the only built-in absent from `builtinPaints` ([render/shapes.ts](../../../packages/motion/src/render/shapes.ts)) because ThorVG has no SVG d-string append — Path cannot render without a user paint function. Separately, `Line` already renders as a skeletal 3D shape: each endpoint is an independent world point, projected per point via `Projection.projectSegment` with near-plane clipping, dispatched in the Renderer's flatten by sniffing `x2`/`y2` on a leaf.

This change replaces `d` with a structured command array (per-point optional `z`) and generalizes the skeletal projection tier from 2 points to N. Decisions fixed by the proposal: no backward compatibility for `d`; **no curves or arcs in this iteration** (M/L/Z only — curve support returns later via deterministic flattening); no path-specific animators (commands are static data; anchor/opacity/style animate as usual).

## Goals / Non-Goals

**Goals:**

- `Path.commands`: a non-empty tagged-union array — `M`/`L` points with optional per-point `z`, `Z` close — in coordinates **local to the path anchor**.
- Per-point perspective projection of every command point, near-plane clipping included, so a path spanning depth foreshortens correctly and degrades gracefully when crossing the camera.
- A built-in ThorVG paint function; Path joins the exhaustive `builtinPaints` manifest.
- Identity invariant preserved: an all-`z`-absent path under the resting camera renders exactly as plain 2D.
- Determinism: pure arithmetic, no wall-clock/RNG, bit-identical re-projection.

**Non-Goals:**

- Curve (`C`/`Q`) and arc (`A`) commands — next iteration (flattening approach already chosen).
- Path morphing / command interpolation — commands change only via `Scene.update` wholesale replacement.
- Parsing SVG `d` strings (a `Path.fromD` helper can come later if ever needed).
- Viewport (offscreen-extent) clipping of path spans — deferred with a `ponytail:` marker (see Risks).
- Per-span depth sort / DoF bucketing — one sort key per path, same acknowledged ceiling as Line's segment midpoint and the tilted plane's quad.

## Decisions

### 1. Command schema: tagged union, local coordinates, `optionalKey` z

```ts
// shapes/Path.ts (sketch)
const point = {
	x: Schema.Number,
	y: Schema.Number,
	z: Schema.optionalKey(Schema.Number), // absent = 0, coalesced at render
};
export const MoveTo = Schema.TaggedStruct("M", point);
export const LineTo = Schema.TaggedStruct("L", point);
export const Close = Schema.TaggedStruct("Z", {});
export const PathCommand = Schema.Union([MoveTo, LineTo, Close]);

// entity fields
{ ...Shape2D.filled, commands: Schema.NonEmptyArray(PathCommand) }
```

- **Local to anchor**, unlike Line's absolute endpoints: world point = anchor `(x, y, z)` + local command point. This keeps the existing Path convention ("x/y offset the whole path without rewriting `d`"), lets `~position` stay the plain `Shape2D.positionLens()` (no Line-style rewrite lens), and means moving a path never touches the array.
- `z` is `Schema.optionalKey`, not `withConstructorDefault`: instantiation runs the *entity struct's* `make` ([Runner.ts:140](../../../packages/motion/src/Runner.ts)) — nested constructor defaults inside a union inside an array are not reliably applied there, and the renderer already coalesces (`data.z ?? 0`) for the camera's optionalKey fields. Same pattern, zero ambiguity.
- **First command must be `M`**, enforced with a `Schema.filter` on the array (loud failure at instantiate, per the loud-defect invariant). A `Z` with no open subpath is a no-op (SVG semantics); an `M` directly after `Z` starts the next subpath.
- The `TaggedStruct` constructors (`Path.MoveTo.make({x, y})` …) are the free authoring sugar; plain literals `{ _tag: "M", x: 0, y: 0 }` also typecheck. No bespoke helper functions in v1.

**Alternative rejected:** flat SVG-like tuples (`["M", x, y, z]`) — cheaper to type but unvalidatable per-command and hostile to the curve commands coming next iteration.

### 2. Styling: keep `Shape2D.filled`

SVG fills `<path>` black by default; `Shape2D.filled` matches (fill black, stroke absent, opacity 1). A stroked-only path sets `fill: none`… which `Shape2D.filled` cannot express today — check: fill is a required Color. **Resolution:** keep `Shape2D.filled` as-is; an author who wants stroke-only sets a transparent fill (`Color.transparent` if present, else alpha-0). This mirrors what Rect/Circle authors already do and adds no schema surface. Fill of an unclosed subpath follows ThorVG (implicit close for filling — same as SVG).

### 3. Projection: `Projection.projectPath` generalizing `projectSegment`

New pure function in [Projection.ts](../../../packages/motion/src/Projection.ts):

```
projectPath(camera, subpaths: Array<{ points: Vec3[]; closed: boolean }>, origin)
  → { subpaths: Array<{ points: Vec2[]; closed: boolean }>; depth; scale } | undefined
```

- The Renderer splits `commands` into subpaths (at `M`/`Z`) and resolves world points (anchor + local, `z ?? 0`) before calling it — the projection layer stays command-vocabulary-agnostic.
- **Closed subpath** → Sutherland–Hodgman near-plane clip then per-vertex perspective divide: exactly `projectPlane`'s algorithm, which already accepts N corners. Extract/reuse it rather than duplicating.
- **Open subpath** → per-span near clip (the 1D lerp-to-NEAR from `projectSegment`) with **splitting**: a middle vertex behind the near plane splits the polyline into separate visible pieces, each a subpath in the output. No reconnection.
- All subpaths fully behind the near plane → `undefined` (cull), matching segment/plane culls.
- `depth` = mean view-space z of the near-visible points; `scale` = `focalLength / depth`. One key per path — consistent with Line's visible-midpoint spirit, and the sort/DoF/stroke-scale ceiling is identical.

**Alternative rejected:** cull-whole-path when any point is behind the camera — cheaper, but camera fly-throughs are a core 3D use and Line already degrades gracefully; a path vanishing at the near plane would be a visible regression in kind.

### 4. Renderer dispatch: `commands` sniff in flatten

In flatten's leaf handling ([Renderer.ts](../../../packages/motion/src/Renderer.ts)), before the `x2`/`y2` skeletal branch: a leaf with an array `commands` field takes the path branch — split into subpaths, resolve world points, `projectPath`, cull on `undefined`, push a paintable whose projection carries `subpaths` (new optional field on `Projection` alongside `quad`/`segment`) plus the shared `depth`/`scale`/`screen` (billboard affine anchored like Line's, for API symmetry). Duck-typing a third field continues the existing pattern; a declared projection-kind on Entity is noted as the eventual refactor once a fourth kind appears, but is not this change's job.

### 5. Paint function: direct ThorVG emission

New `path` paint in [render/shapes.ts](../../../packages/motion/src/render/shapes.ts): one `Tvg.Shape`, for each projected subpath `moveTo` first point, `lineTo` the rest, `close()` when closed; `applyStyle` for fill/stroke/opacity; stroke width × `projection.scale` (as Line does). Points arrive already in screen space, so no transform is applied — add to scene directly, like the quad and segment branches. Path enters `builtinPaints` and its type union; the "Path is omitted deliberately" comment is deleted.

## Risks / Trade-offs

- **[No viewport clipping]** ThorVG stroke cost scales with a path's full extent, offscreen included; a near-camera path can project enormous. → Accepted for v1 with a `ponytail:` comment naming the ceiling and the upgrade (per-span Liang–Barsky via the existing `clipSegmentToRect`, with the same splitting machinery as the near clip). Line keeps its clip; Path authors hit this only in extreme close-fly-bys.
- **[Near-clip artifacts on closed+stroked subpaths]** Sutherland–Hodgman closes the polygon along the near-plane cut, so a stroke draws along that synthetic edge. → Accepted; visually minor, and the alternative (separate stroke/fill geometries per subpath) is complexity the first version doesn't need. Note in the paint comment.
- **[One depth key per path]** A path spanning large depth sorts/blurs as one unit. → Same documented ceiling as Line's segment and the tilted plane's quad; upgrade path (per-span keys) already recorded there.
- **[Non-planar closed subpaths]** Fill of a closed subpath whose points aren't coplanar has no single "correct" projection; per-point projection yields whatever screen polygon results. → Documented as author-facing semantics: fill is defined on the projected screen polygon.
- **[Effect Schema beta union-in-array behavior]** `NonEmptyArray(Union(TaggedStruct...))` + `filter` under the pinned `effect@4.0.0-beta.94` needs a smoke test at instantiate before building on it. → First implementation task validates the schema shape in isolation.

## Migration Plan

None — `d` had no working render path, so no scene in the repo (or plausibly anywhere) renders it. Docs examples that mention Path (if any) are updated to `commands` in the same change. Sync deltas into `openspec/specs/` on archive.

## Open Questions

None blocking. Curve flattening parameters (subdivision policy, determinism of adaptive tolerance) are the next iteration's design question, deliberately not pre-decided here beyond "flattening is the chosen direction."
