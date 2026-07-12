# Design: Add Shapes Library

## Context

Entity definitions (`Entity.make` + Schema fields with `withConstructorDefault`) and per-format render functions (`data → SvgNode`) exist but are duplicated in every consumer. The renderer architecture already separates formats from sinks: one `SvgNode` render function per shape serves both the string and DOM sinks via `Svg.entityRendererLayer`. This change organizes built-ins the way Effect organizes platform code: interfaces in the main package (`effect`'s `Redis`), implementations in platform packages (`@effect/platform-node`) — as directories, not packages.

## Goals / Non-Goals

**Goals:**
- Built-in shapes defined once, consumed everywhere (demo, playground, tests, users).
- Definitions are renderer-agnostic; adding a render target later (Lottie) means adding that target's `shapes.ts`, touching nothing in `shapes/`.
- Styling props limited to what any plausible target can express.
- Default-constructed shapes are visible.

**Non-Goals:**
- Transforms (rotation, scale, anchor) — future camera/transform work; `x`/`y` position only.
- Rich styling (gradients, dash arrays, filters, fonts/Text) — expand later per demand.
- Actual Lottie (or any second target) — this change only establishes the structure for it.
- Package splitting — directories with a dependency rule, same package.

## Decisions

### D1: Effect-style layout — definitions vs target implementations
```
src/shapes/            pure definitions (imports: Entity, Schema only)
  Shape2D.ts  Circle.ts  Rect.ts  Square.ts  Ellipse.ts  Line.ts  index.ts
src/svg/               everything SVG
  SvgNode.ts  SvgRenderer.ts  SvgDomRenderer.ts  shapes.ts  index.ts
```
Dependency direction: `svg/shapes.ts` → `shapes/`; never the reverse. Each target's `shapes.ts` is its coverage manifest — a shape it doesn't register fails at the type level (missing `Renderers<Entities>` requirement), not at runtime. Rejected: colocating render functions inside shape files (adding a target would touch every definition file and drag renderer imports into pure definitions).

### D2: Portable prop set
`Shape2D` fields: `x`, `y` (numbers, default 0), `fill` (color string), `stroke` (color string), `strokeWidth` (number), `opacity` (number 0–1). Deliberately small: every field must be expressible in SVG, canvas, and Lottie. Transforms excluded (D-future: camera). Per-shape fields: `Circle{radius}`, `Rect{width,height}`, `Square{size}`, `Ellipse{rx,ry}`, `Line{x2,y2}` (with `x`,`y` as the start point), `Path{d}` — `d` is required (an empty path can never satisfy the visible-defaults rule, so there is no default), and `x`/`y` offset the whole path (targets translate it, emitted only when nonzero) so position stays animatable without rewriting `d`.

### D3: Intuitive defaults — "a new shape is visible"
- Filled shapes: `fill` defaults `"black"`; `stroke`/`strokeWidth` optional, absent.
- `Line`: fill does not apply; defaults `stroke: "black"`, `strokeWidth: 1` (otherwise a default Line is invisible — the least intuitive outcome possible).
- `opacity` defaults 1.
- Absent optional props are omitted by targets (an `SvgNode`'s props contain exactly what appears in output — no undefined juggling). The omit logic lives in each target's attr helper (`svg/shapes.ts`), because "what absent means" is target-specific.
- Optional fields use the v4 Schema optional-field combinator consistent with the existing `withConstructorDefault` pattern; exact combinator chosen at implementation.

### D4: Entity namespace
`shapes/Circle`, `shapes/Rect`, ... — settled now while renaming is free (entity names key renderer contexts: `SvgRenderer/shapes/Circle`).

### D5: `src/Svg.ts` → `src/svg/` module split
Mechanical: `SvgNode.ts` (type + `vnodeToString` + escaping), `SvgRenderer.ts`, `SvgDomRenderer.ts`, `shapes.ts` (new), `index.ts` re-exporting all plus `entityRendererLayer` and the combined `layer`. `svg/shapes.ts` additionally exports `shapesLayer` (every built-in registered with both sinks) so consumers provide one layer. Import sites updated (`demo`, `playground`, tests, index barrel). Pre-1.0, no compatibility shim.

### D6: Square is its own entity, not Rect sugar
`Square{size}` reads better in scenes and its schema is the constraint (`Rect` can't enforce width === height through updates). Costs one tiny definition + one line per target manifest.

## Risks / Trade-offs

- [Adding a target means implementing every built-in shape for it] → Inherent to the feature, not the layout; the manifest file makes coverage explicit and type-checked.
- [Prop set too small for real scenes] → Expanding `Shape2D` is additive (new optional fields + target helper support); starting small avoids stranding future targets with unsupportable props.
- [Line's special default surprises users expecting uniform Shape2D defaults] → It's the *visible* choice; documented in the definition file. Uniform-but-invisible is worse.
- [Module move breaks imports] → All consumers are in-repo; one mechanical pass.

## Open Questions

- None blocking.
