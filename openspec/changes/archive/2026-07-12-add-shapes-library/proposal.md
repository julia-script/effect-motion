# Add Shapes Library

## Why

Every scene (demo, playground, tests) re-defines Circle/Square entities and their renderers by hand — ~40 duplicated lines per consumer, growing with each new scene. The library should ship built-in shape definitions with common styling props, organized so one definition supports many render targets (SVG today, Lottie etc. later) without coupling definitions to any renderer.

## What Changes

- **New `src/shapes/`** — pure definitions, Effect-style "main package": `Shape2D` shared fields plus `Circle`, `Rect`, `Square`, `Ellipse`, `Line`, `Path` entities (namespace `shapes/<Name>`). Zero renderer imports.
- **Portable prop set, deliberately limited** so future targets can support all of it: `x`, `y` (position, default 0), `fill`, `stroke`, `strokeWidth`, `opacity`. No transforms/rotation (future camera territory).
- **Intuitive defaults**: a default-constructed shape is visible — filled shapes default `fill: "black"` with stroke absent; `Line` (unfillable) instead defaults `stroke: "black"`, `strokeWidth: 1`. Absent optional props are simply not emitted by targets.
- **BREAKING**: `src/Svg.ts` becomes the `src/svg/` module — Effect-style "platform package": `SvgNode.ts` (format + `vnodeToString`), `SvgRenderer.ts` (string sink), `SvgDomRenderer.ts` (DOM sink), and new `shapes.ts` — the per-shape SvgNode render functions and the bundled layer registering every built-in shape with both sinks. Import paths change (`./Svg` → `./svg`); index barrel re-exports `Svg` and `Shapes`.
- Dependency rule enforced by layout: `shapes/` never imports from render targets; each target's `shapes.ts` imports the definitions and is that target's coverage manifest.
- demo and playground consume the library shapes (duplicated entity/renderer definitions deleted).
- Tests: shape constructor defaults, SVG attr mapping (including absent-prop omission and Line visibility), existing both-sinks contract test moved onto library shapes.

## Capabilities

### New Capabilities

- `shapes`: Built-in shape entity definitions with the portable styling prop set, their defaults, and the per-target implementation-manifest pattern (including full SVG coverage of the starter set).

### Modified Capabilities

<!-- none — svg-rendering requirements (SvgNode contract, sinks) are unchanged; the module move is implementation detail -->

## Impact

- New `src/shapes/` (6 files); `src/Svg.ts` split into `src/svg/` (5 files).
- `src/demo.ts`, `playground/main.ts`, `test/svg.test.ts`: consume library shapes; `src/index.ts` re-exports `Shapes`.
- No dependency changes.
