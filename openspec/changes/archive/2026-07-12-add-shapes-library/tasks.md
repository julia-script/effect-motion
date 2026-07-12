# Tasks: Add Shapes Library

## 1. Shape definitions (src/shapes/)

- [x] 1.1 `Shape2D.ts`: shared field set — `x`/`y` (default 0), `fill`/`stroke`/`strokeWidth` (optional per design D3), `opacity` (default 1); pick the v4 Schema optional-field combinator and document the visible-defaults rule
- [x] 1.2 `Circle.ts` (radius), `Rect.ts` (width/height), `Square.ts` (size), `Ellipse.ts` (rx/ry) — filled shapes: fill defaults black, stroke absent; namespace `shapes/<Name>` (design D2/D4)
- [x] 1.3 `Line.ts` (x2/y2, with x/y as start): overrides — no fill; stroke defaults black, strokeWidth 1 (design D3)
- [x] 1.4 `shapes/index.ts` re-exporting all definitions
- [x] 1.5 `Path.ts` (required `d`, filled): svg fn emits translate for x/y offset only when nonzero; registered in manifest, tested, demoed

## 2. svg/ module (split of src/Svg.ts, design D5)

- [x] 2.1 Split Svg.ts: `svg/SvgNode.ts` (type + vnodeToString + escaping), `svg/SvgRenderer.ts`, `svg/SvgDomRenderer.ts`, `svg/index.ts` (re-exports + `entityRendererLayer` + combined `layer`); delete src/Svg.ts
- [x] 2.2 `svg/shapes.ts`: attr helper (common props → SVG attrs, omitting absent ones), per-shape render functions (circle/rect/ellipse/line tags), and `shapesLayer` registering every built-in with both sinks
- [x] 2.3 Update `src/index.ts`: export `Svg` (from svg/) and `Shapes` (from shapes/)

## 3. Consumers

- [x] 3.1 src/demo.ts: use library `Shapes.Circle`/`Shapes.Square` + `shapesLayer`; delete local entity/renderer definitions
- [x] 3.2 playground/main.ts: same migration; keep the rAF loop untouched

## 4. Tests

- [x] 4.1 Shape defaults: default circle data has fill black/opacity 1/no stroke; default line has stroke black/strokeWidth 1 (spec "Visible defaults")
- [x] 4.2 SVG manifest: every built-in renders through both sinks with correct tags/attrs via `shapesLayer`; absent stroke omitted from output; default line visibly stroked
- [x] 4.3 Update test/svg.test.ts imports for the svg/ module move (SvgNode contract tests unchanged in behavior)

## 5. Verify

- [x] 5.1 `pnpm check`, `pnpm lint`, `pnpm test` green; demo output unchanged in shape; playground plays in the browser
