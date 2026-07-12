# Tasks: Add SVG DOM Renderer

## 1. SvgNode and sinks (new src/Svg.ts)

- [x] 1.1 Define `SvgNode` (tag, props of string|number, optional children: nodes or text) and `vnodeToString` with attribute escaping (design D1/D2)
- [x] 1.2 Move the string renderer into src/Svg.ts as `SvgRenderer = Renderer.make<SvgNode, { width; height }>()("SvgRenderer", ...)` folding nodes into an `<svg xmlns width height>` document string
- [x] 1.3 Implement `SvgDomRenderer = Renderer.make<SvgNode, { target; width; height }>()("SvgDomRenderer", ...)`: clear-and-rebuild an `<svg>` root inside target, `createElementNS` recursively, namespace sink-owned (design D2/D3)
- [x] 1.4 Export `Svg` from src/index.ts

## 2. Demo migration

- [x] 2.1 Migrate demo entity renderers to return `SvgNode` (circle, rect) and render via the library `SvgRenderer` with `{ width, height }` config; delete the demo-local renderer definition

## 3. Tests

- [x] 3.1 `vnodeToString`: element with props, nested children, text children, attribute escaping (pure, node environment)
- [x] 3.2 DOM sink with happy-dom (`@vitest-environment` pragma): svg root sized from config, elements created in SVG namespace, nested children materialized, re-render replaces previous frame's content
- [x] 3.3 Contract test: one entity renderer layer drives both sinks (string output and DOM output agree on tags/attrs)

## 4. Playground

- [x] 4.1 Add `vite` and `happy-dom` devDependencies; add `"playground"` script
- [x] 4.2 Create playground/index.html + playground/main.ts: mount div, rAF loop awaiting one frame per display refresh, `Scene.step` + `SvgDomRenderer.render(frame, { target, width, height })`, stop when step returns null (design D5)
- [x] 4.3 Verify in the browser: demo scene plays as moving shapes and stops at its final state

## 5. Verify

- [x] 5.1 `pnpm check`, `pnpm lint`, `pnpm test` all green
