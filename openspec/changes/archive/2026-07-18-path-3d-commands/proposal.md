# Path 3D Commands

## Why

`Shapes.Path` is half-orphaned: its `d: string` schema cannot be consumed by ThorVG (no SVG d-string append), so Path is the one built-in that cannot render at all without a user-supplied paint function. Meanwhile `Line` already renders as a true skeletal 3D shape (per-endpoint world points, per-point projection). Replacing the `d` string with a structured command array — each point carrying an optional `z` — closes both gaps at once: Path becomes renderable through ThorVG's native `moveTo`/`lineTo`/`close` calls, and it generalizes Line's skeletal treatment from 2 points to N.

## What Changes

- **BREAKING**: `Shapes.Path` loses `d: string` entirely, replaced by `commands` — a non-empty array of tagged command structs. No migration path; nothing could render the old field anyway.
- Command vocabulary for this iteration: `M` (move), `L` (line), `Z` (close) — straight polylines only. Each `M`/`L` point is `{ x, y, z? }` with `z` defaulting to 0. Curves (`C`/`Q`) and arcs (`A`) are deferred to a follow-up iteration (planned approach: deterministic flattening to line segments).
- Command points are **local to the path's anchor** (`x`/`y`/`z`): the `~position` trait moves the anchor, never rewrites the command array — unlike Line, whose endpoints are absolute.
- The renderer projects every command point independently (anchor + local point → world → per-point perspective), extending the skeletal tier from Line's 2-point segment to an N-point polyline, with near-plane clipping per span and viewport clipping for ThorVG stroke cost.
- Path joins the built-in ThorVG paint manifest (`builtinPaints`), removing the "consumers provide their own paint function" carve-out.
- Animation: no path-specific animator work. `commands` is static data animated only via `Scene.update`; tweens target the anchor, opacity, and style fields like any shape. Morphing helpers are explicitly out of scope (possible follow-up).

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `shapes`: Path entity redefined — `d` string removed, `commands` array (M/L/Z, per-point optional `z`) added; local-to-anchor coordinate semantics; Line-style stroke defaults question resolved in design.
- `object-depth`: the skeletal positioning tier generalizes from "Line's two endpoints" to "every defining point of a skeletal shape" — Path's command points project per-point with their own world depth; one depth/scale sort key per paintable stays the acknowledged ceiling.
- `motion-renderer`: Path enters the exhaustive built-in paint manifest, painted via ThorVG `moveTo`/`lineTo`/`close` from projected screen points; the documented Path omission is deleted.

## Impact

- `packages/motion/src/shapes/Path.ts` — schema rewrite (commands union, defaults, traits).
- `packages/motion/src/Renderer.ts` — flatten gains a path-leaf branch (per-point projection, near-plane + viewport clipping).
- `packages/motion/src/Projection.ts` — polyline projection helper (generalizing `projectSegment`).
- `packages/motion/src/render/shapes.ts` — new `path` paint function; manifest union updated; stale omission comment removed.
- Tests in `packages/motion/test/`; docs example + registry entry in `apps/docs`.
- No new dependencies. No effect on other shapes' output (identity invariant: an all-z=0 path under the resting camera renders as plain 2D).
