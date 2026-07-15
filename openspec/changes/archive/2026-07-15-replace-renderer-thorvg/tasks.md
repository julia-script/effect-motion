# Tasks

## 1. GATE — prove ThorVG headless in Node (no deletions until this passes)

- [x] 1.1 Add `@thorvg/webcanvas`; ✅ installs, and `ThorVG.init({renderer:"sw"})` loads the WASM in plain Node
- [x] 1.2 Headless proof — **FAILED.** `new TVG.Canvas(selector)` throws `window is not defined`. The `@thorvg/webcanvas` Canvas is browser-coupled (constructor needs `document.querySelector` → an HTML `<canvas>`; the bundle uses `getContext`/`getImageData`/`HTMLCanvas`). There is **no pixel-readback API** (`render()` paints into a DOM canvas; no `getPixels`/`toBuffer`), and the published WASM exposes no memory-buffer `SwCanvas::target`. No ThorVG npm package is a Node/headless build.
- [x] 1.3 Font proof — not reached (blocked by 1.2)
- [x] 1.4 **Decision gate: STOP.** 1.2 failed → SVG sinks + resvg stay, nothing deleted. §2–§7 are NOT executed. See design "Gate Outcome" for the re-scoping options.

## 2. Draw-list contract (replaces SvgNode)

- [ ] 2.1 Define the draw-list node type: discriminated kind (rect/circle/ellipse/path/text/group), resolved fill/stroke/opacity, and a 2D affine transform OR explicit screen points
- [ ] 2.2 Change `Renderer.make`/`RenderFunction` to emit draw-list nodes instead of `SvgNode`; keep flatten→project→sort untouched
- [ ] 2.3 Port each built-in shape renderer (Circle, Rect+tilt, Square, Ellipse, Line, Path, Text, Group, ParticleField) to produce draw-list nodes
- [ ] 2.4 Move determinism tests from SVG-string assertions to draw-list assertions (kinds, coords, fills, order); a tilted Rect carries four explicit corners

## 3. ThorVG sink (shared draw-list walker, two backends)

- [ ] 3.1 A sink module that walks a draw-list and issues ThorVG calls: shape→Shape, text→Text, group→nested Scene, fill/stroke/opacity + transform/points, added in order
- [ ] 3.2 Browser backend: mount a Gl/Wg canvas; draw the current frame's draw-list
- [ ] 3.3 Node backend: software canvas → pixel buffer for one frame
- [ ] 3.4 Isolate ALL `tvg` API calls behind this module (one file to change on API churn); define its own tagged rasterization/backend error
- [ ] 3.5 Cross-backend test: same scene → same draw-list → same shapes/order on both backends

## 4. React player on ThorVG

- [ ] 4.1 Repoint `<Player>`/`usePlayer` to mount a ThorVG canvas and draw draw-lists (was the SVG DOM sink)
- [ ] 4.2 Reconcile the WASM canvas with `usePlayer`'s buffered rAF clock (does the canvas own its loop, or does the hook drive draws?) — see design open question
- [ ] 4.3 Update react tests: first buffered frame is drawn to the ThorVG canvas; transport/scrub/loop/time-readout behavior unchanged

## 5. Export on ThorVG (drop resvg)

- [ ] 5.1 Rewrite `Video.render`: `Scene.stream → ThorVG software buffer → Ffmpeg.encode`; no SVG string, no PNG file
- [ ] 5.2 Register scene-declared fonts with ThorVG's Node rasterizer (unify with the browser font path)
- [ ] 5.3 Delete `packages/export/src/Resvg.ts` and the `@resvg/resvg-js` dependency; keep Ffmpeg/Video/Fonts wiring
- [ ] 5.4 Update export tests: end-to-end scene→MP4 via ThorVG; odd-dimension guard + frame-cap behavior preserved

## 6. Delete the SVG rendering stack

- [ ] 6.1 Delete `SvgRenderer.ts`, `SvgDomRenderer.ts`, `SvgNode.ts`, `svg/project.ts`, the SVG shape serializers, `svg/layers.ts`, and dead `svg/` remnants
- [ ] 6.2 Remove all `Svg.*` exports/imports across motion/react/export; fix the fallout
- [ ] 6.3 Grep for lingering `SvgNode`/`resvg`/string-sink references and remove them

## 7. Docs + verification

- [ ] 7.1 Rewrite the docs mentions of the SVG sinks and the resvg export path to the ThorVG model; note the WASM bundle in the react package
- [ ] 7.2 `pnpm test`, `pnpm check`, `pnpm lint` green across all packages
- [ ] 7.3 Verify end-to-end: a runnable example plays in the browser via ThorVG, and `Video.render` produces an MP4 in Node — confirm text matches between the two
