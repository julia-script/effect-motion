## Context

effect-motion renders through a sink abstraction. `Renderer.make` walks a frame, flattens the tree, projects every paintable through the 3D camera, sorts by depth, and hands a **depth-sorted list of paintables** (each with a projected 2D transform, and for tilted Rects the four projected screen corners) to a sink's `config.render`. Today two sinks consume this via the `SvgNode` contract — `SvgRenderer` (self-contained SVG string, the export path) and `SvgDomRenderer` (live DOM). Offline video export lives in `@effect-motion/export`: `Scene.stream → SvgRenderer (string) → resvg (SVG→PNG) → ffmpeg`.

Two structural problems motivate this change:
1. **Text inconsistency.** The browser and resvg use different font engines, so the same scene's text differs between live preview and exported video. We have little control over either.
2. **Three paint paths.** A string sink, a DOM sink, and a resvg rasterizer are three implementations of "turn a frame into pixels", split only because the browser DOM isn't available in Node and we refuse to depend on Puppeteer.

[ThorVG](https://github.com/thorvg/thorvg) is a portable 2D vector engine (`@thorvg/webcanvas` WASM) with an imperative retained-mode scene graph — `Shape` (`appendRect`, `appendCircle`, `moveTo`/`lineTo`/`cubicTo`/`close`, `fill`, `stroke`, 2D affine transform), `Scene` (nesting + paint order via `add`/`push`), `Text`, and `Canvas` in software / OpenGL / WebGL / WebGPU flavors. Crucially it is **2D-affine only** — no camera, no perspective, no 4×4 matrix — and it has its **own font rasterizer** that runs identically on every backend.

The key architectural fact: **ThorVG slots into the exact seam we already expose.** Our pipeline already emits final 2D screen coordinates (billboard affine, or four projected corners for a tilt). ThorVG only needs to draw those flat 2D shapes fast. The 3D→2D projection stays entirely ours; ThorVG never sees a `z`.

## Goals / Non-Goals

**Goals:**
- One renderer, driven from one draw path, that works in the browser (GPU) and in Node (headless software WASM → pixel buffer).
- Pixel-consistent output — especially text — between live preview and exported video.
- Delete the SVG string sink, the DOM sink, and the resvg rasterizer; simplify `@effect-motion/export` to `frame → ThorVG buffer → ffmpeg`.
- Preserve the 2.5D pipeline (`Projection.ts`, flatten→project→sort) byte-for-byte in behavior.
- Preserve determinism, asserted on the **draw-list** (shapes/coords/fills/order), not on rasterized pixels.

**Non-Goals:**
- Using ThorVG's Lottie or SVG *loaders*. We use only its imperative drawing API. (Its "Lottie renderer" label is irrelevant to us.)
- Perspective-correct texture/gradient/text foreshortening across a tilted face — ThorVG is 2D-affine, so this stays a documented limitation exactly as it is today for solid-fill tilt.
- Meshes, real 3D geometry, or any use of a GPU 3D pipeline. ThorVG is a fast 2D rasterizer, not a 3D engine.
- Bit-identical **pixels** across GPUs/drivers. Determinism is a draw-list property; the GPU backend is browser-playback only and never asserted on.
- Keeping any SVG output. No backwards compatibility.

## Decisions

### D1 — ThorVG replaces the rasterizer, NOT the projector

The 3D lives in our code and stays there. `Projection.ts` and the flatten→project→sort stages are untouched. ThorVG receives 2D screen coordinates only:
- a **billboard** → the projected screen anchor + uniform scale (our existing `billboardAffine`) maps directly onto ThorVG's 2D affine transform;
- a **tilted Rect** → the four projected screen corners become a ThorVG path (`moveTo`/`lineTo`×3/`close`), an exact filled quad.

**Why this dissolves the "2D-only" worry:** we never ask ThorVG to do perspective. By the time a shape reaches ThorVG it is already a flat 2D primitive at final coordinates. ThorVG's lack of a 4×4 matrix is irrelevant. Alternative considered — leaning on a GPU 3D engine (three.js/regl) to do projection — rejected: it would throw away the deterministic, sink-agnostic projection we already own and couple determinism to GPU output.

### D2 — The sink contract becomes a renderer-agnostic draw-list, replacing `SvgNode`

`SvgNode` is an SVG-specific vnode (tag + props + children). It is replaced by a neutral **draw-list node** describing paint intent independent of any backend: a discriminated shape (rect / circle / ellipse / path / text / group), its resolved fill/stroke/opacity, and its transform or explicit points. The renderer emits these in depth-sorted order; the ThorVG sink translates each to a `tvg` call.

**Why keep an intermediate at all rather than emit `tvg` shapes directly from `RenderFunction`?** Two reasons: (1) **determinism** — the draw-list is the thing we assert on in tests; it's pure data, inspectable, backend-free, and keeps the test suite fast (no WASM in most tests). (2) **portability** — a neutral draw-list means a future second backend (native, a different engine) is another consumer, not a rewrite. The draw-list is a smaller, more honest contract than `SvgNode` (no SVG tag semantics leaking in).

Alternative — emit `tvg.Shape` objects straight from the pipeline — rejected: it forces WASM into every render test and re-couples the deterministic layer to a specific rasterizer, the same mistake as asserting on pixels.

### D3 — Two ThorVG backends from one draw path: Gl/Wg (browser) + Sw (Node)

The same draw-list-walking code targets:
- **browser:** a `GlCanvas`/`WgCanvas` mounted in the DOM for live, GPU-accelerated playback (replaces `SvgDomRenderer`);
- **Node:** a `SwCanvas` rendering headless to a raw pixel buffer (replaces `SvgRenderer` string + resvg), fed frame-by-frame to ffmpeg.

**Why software in Node, not GPU:** offline export is throughput, not realtime; the software (SIMD) backend needs no GPU/display and is deterministic, which suits both CI and reproducible video. GPU in Node is possible later but is not a goal.

### D4 — Determinism is a draw-list property, asserted pre-rasterization

Tests assert on the draw-list (shape kinds, coordinates, fills, paint order) — the deterministic output we compute — exactly where they assert on `SvgNode`/SVG strings today. Rasterization is ThorVG's responsibility and is **not** asserted on. This is strictly at least as strong as today (resvg's pixel output was never in our assertions) and avoids all GPU-variance concerns.

`ponytail:` an optional software-backend pixel-hash smoke test could be added for the export path later, but it is not part of the determinism contract and is not required.

### D5 — Headless-Node proof gates all deletions

ThorVG's Node headless WASM → pixel-buffer capability is **unconfirmed by the public docs** (all `@thorvg/webcanvas` examples are browser-framework-based). It is the load-bearing assumption for full replacement: if ThorVG cannot rasterize headless in Node, the export path can't drop resvg, and "one renderer" collapses back to needing a browser (i.e. Puppeteer — the thing we're avoiding).

Therefore implementation task #1 is a **20-line headless proof**: load the WASM software canvas in Node, draw a rect + a text run, read back a pixel buffer, write a PNG. Only after it passes does anything get deleted. If it fails, the SVG sinks and resvg stay, and the change is re-scoped (e.g. ThorVG for browser only, keep resvg for export) or abandoned.

## Risks / Trade-offs

- **[Node headless WASM unconfirmed — load-bearing]** → Gated: task #1 proves it before any deletion (D5). Failure halts the change with SVG sinks intact.
- **[Determinism moves from bytes to a draw-list]** → Assert on the draw-list, not pixels (D4). Same strength as today, no GPU variance exposure.
- **[WASM init in tests slows the fast suite]** → Keep most tests on the draw-list (pure data, no WASM). Only a thin ThorVG-integration test suite loads the module, initialized once and reused.
- **[Tilted text/gradient not perspective-correct]** → Unchanged from today's documented limitation; ThorVG is 2D-affine. Solid-fill tilt stays exact.
- **[New WASM dependency + bundle size]** → ThorVG WASM is a real payload for the browser player. Acceptable for a motion-graphics tool; note it in the react package.
- **[ThorVG API maturity / churn]** → `@thorvg/webcanvas` is younger than resvg. Isolate all `tvg` calls behind the single sink module so an API change is one file.

## Migration Plan

1. **Prove headless Node** (gate). ThorVG SW canvas in Node → pixel buffer → PNG. Stop here if it fails.
2. Add the draw-list type; make `Renderer.make`/`RenderFunction` emit draw-list nodes. Port the existing shape renderers to produce draw-list nodes instead of `SvgNode`. Tests now assert on the draw-list.
3. Add the ThorVG sink: a draw-list walker with a browser (Gl/Wg) and a Node (Sw) backend.
4. Repoint `@effect-motion/react` Player/usePlayer to mount a ThorVG canvas.
5. Repoint `@effect-motion/export` `Video.ts` to `frame → ThorVG Sw buffer → ffmpeg`; delete `Resvg.ts` + `@resvg/resvg-js`.
6. Delete `SvgRenderer`, `SvgDomRenderer`, `SvgNode`, `svg/project.ts`, the SVG shape serializers.
7. Rewrite the two docs mentions of the SVG sinks / resvg.

Rollback: it's a branch; revert drops it. The gate (step 1) is the point of no easy return — deletions only start at step 5–6.

## Gate Outcome (D5) — FAILED, full replacement halted

The task-#1 headless proof **failed**. Empirical findings (spike, 2026-07-15):

- `ThorVG.init({ renderer: "sw" })` loads the WASM fine in plain Node.
- `new TVG.Canvas(selector)` throws `window is not defined`. The `@thorvg/webcanvas` Canvas is hard-coupled to the browser: the constructor takes a CSS selector and resolves an HTML `<canvas>`; the bundle uses `getContext`/`getImageData`/`querySelector`/`HTMLCanvas`.
- There is **no pixel-readback API** — `render()` paints into the DOM canvas; no `getPixels`/`toBuffer`. Getting pixels out requires `canvas.getImageData()` / `gl.readPixels()` (DOM/WebGL).
- The published web WASM exposes no memory-buffer `SwCanvas::target`; ThorVG's native `SwCanvas::target(buffer,…)` is not compiled in.
- No ThorVG npm package (`webcanvas`, `lottie-player`, `react-thorvg-fiber`, `expo-thorvg`, `react-native-thorvg`) is a Node/headless build.

**Conclusion:** ThorVG-web cannot rasterize headless in Node today, so "one renderer everywhere, delete resvg" is not achievable with the current packages. Per D5, the SVG sinks + resvg stay and **nothing is deleted**.

Re-scoping options (a follow-up change would pick one):

1. **Browser-only ThorVG.** Adopt ThorVG for the live React player (GPU perf, WebGPU path) but keep the SVG-string sink + resvg for Node export. Loses the text-consistency win (two font engines again) — the main motivation — so weak on its own.
2. **Provide a headless canvas shim.** Run `@thorvg/webcanvas` in Node behind a DOM/`node-canvas` (Skia) or headless-GL shim, reading pixels via `getImageData`. Fragile, pulls in a native canvas dep, and its rasterizer (Skia) differs from ThorVG-web's — so consistency is not guaranteed. Effectively resvg-with-extra-steps.
3. **Build a custom ThorVG WASM** that exposes `SwCanvas::target(buffer)` for Node. Real portability + true consistency, but means maintaining a WASM build of ThorVG — a large, ongoing cost.
4. **Wait / upstream.** Ask ThorVG for an official headless-Node build (or a buffer-target export), revisit when it exists.

Recommendation: do **not** proceed now. Option 1 alone doesn't deliver the goal; options 2–4 are their own projects. Keep the SVG stack; revisit if ThorVG ships a headless build or if browser-only GPU playback becomes worth it independently.

## Open Questions

- **Draw-list shape coverage:** does the neutral draw-list need every current shape (Path, Text with fonts, ParticleField) on day one, or can particles/text land after the core shapes? (Leaning: core shapes + text first, particles follow — text is the whole consistency argument.)
- **Font loading in Node ThorVG:** how are custom fonts registered with ThorVG's rasterizer in Node vs. browser, and does that unify the current `Fonts.ts` split across motion/export? (Spike alongside the headless proof.)
- **Player mount:** does the ThorVG browser canvas play well with React's lifecycle / the buffered `usePlayer` clock, or does the WASM canvas want to own its own rAF loop? (Affects how invasive the react change is.)
- **WGPU vs GL default in browser:** ship GL (broad support) first and treat WebGPU as progressive enhancement? (Leaning yes.)
