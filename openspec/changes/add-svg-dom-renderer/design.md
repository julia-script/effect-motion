# Design: Add SVG DOM Renderer

## Context

`Renderer.make<RenderEntitySuccess, Config>()` (src/Renderer.ts) already supports everything this change needs: per-entity renderers resolved from context, a `RenderSuccess` type per renderer family, and a pass-through `Config` on `render(frame, config)` (with `Config = void` callers may omit the argument — TS's void-argument rule). The string `SvgRenderer` currently lives in demo.ts and entity renderers return strings. Scenes already stream settled frames (`Scene.stream` / `Scene.step`), keyed by stable instance ids.

## Goals / Non-Goals

**Goals:**
- Watch scenes live in a browser with minimal setup.
- One entity-renderer set feeding both string and DOM output: entity renderers return data (`SvgNode`), sinks own materialization.
- User-defined entities need only a `makeEntityRendererLayer` returning `SvgNode` — sinks never need to know the entity set.
- Keep the camera seam clean for later without building any of it now.

**Non-Goals:**
- Reconciliation/diffing (v0 is clear-and-rebuild; upgrade is sink-internal later).
- Cameras / coordinate transforms — positions are absolute in a fixed viewport. (Future: a camera transforms values between frame data and applied props; it belongs in the frame-render stage, upstream of sinks.)
- Events/interactivity on rendered nodes.
- Playback controls (pause, scrub, fps caps) — the rAF loop is the only pacing.

## Decisions

### D1: `SvgNode` — data contract between entity renderers and sinks
```ts
interface SvgNode {
	tag: string;
	props: Record<string, string | number>;
	children?: ReadonlyArray<SvgNode> | string; // string = text content
}
```
Plain data, recursive for groups (`<g>`), string children for `<text>`. Rejected alternatives: (a) entity renderers mutate DOM directly — couples user renderers to one sink, allows namespace mistakes, unusable for string output; (b) a Schema-validated node — cheap but not needed until untrusted third-party renderers exist; note as future hardening.

### D2: Sinks
- **`SvgRenderer` (string)**: `Renderer.make<SvgNode, SvgConfig>()("SvgRenderer", ...)` — fold each node with `vnodeToString`, wrap in `<svg xmlns=... width=... height=...>`. Escape attribute values (`"` and `&` at minimum).
- **`SvgDomRenderer`**: `Renderer.make<SvgNode, SvgDomConfig>()("SvgDomRenderer", ...)` where `SvgDomConfig = { target: HTMLElement; width: number; height: number }`. Per render: ensure/replace an `<svg>` root sized `width`×`height` inside `target`, then create and append each node via `createElementNS("http://www.w3.org/2000/svg", tag)` recursively. Namespace handling lives only here.
- `SvgConfig = { width: number; height: number }` — shared viewport meaning across both sinks; positions in frame data are absolute within it.

### D3: v0 DOM strategy — clear-and-rebuild
`render(frame, config)` is stateless (config passes the target each call), so the sink holds no state: clear the root, rebuild all nodes. Correct by construction, plenty fast for demo-scale scenes at 60fps. Upgrade path (documented, not built): keyed reconciliation with `WeakMap<Element, Map<instanceId, Element>>` — instance ids are already stable keys, so it's a map merge (enter/update/exit), not tree diffing. The upgrade changes nothing outside the sink.

### D4: One module — `src/Svg.ts`
`SvgNode`, `vnodeToString`, `SvgRenderer`, `SvgDomRenderer` in one file, exported from the index barrel as `Svg`. Matches the repo's flat one-module-per-concept layout. demo.ts keeps only entity definitions, the scene, and per-entity renderer layers.

### D5: Playground — vite + rAF pull loop
`playground/index.html` + `playground/main.ts`, `vite` devDependency, `"playground": "vite playground"` script. The loop awaits `requestAnimationFrame`, then `Scene.step(runningScene)`, then `SvgDomRenderer.render(frame, { target, width, height })` — one phase per display frame. This is the payoff of the externally paced phaser: the browser's frame clock is the controller; no throttling or timers. Scene ends → `step` returns null → loop stops.

### D6: DOM testing with happy-dom
`happy-dom` devDependency; the DOM-sink test sets vitest environment per-file (`// @vitest-environment happy-dom`). Assert created tags, namespace, attribute values, and that re-render replaces prior content. `vnodeToString` tests are pure.

## Risks / Trade-offs

- [Clear-and-rebuild flickers or gets slow at scale] → Not at demo scale; keyed reconciliation is a contained sink upgrade (D3). No API change.
- [`props` typed loosely (`string | number`) lets invalid SVG attributes through] → SVG silently ignores unknown attributes; acceptable for now. Schema validation of `SvgNode` is the hardening path (D1).
- [vite + happy-dom dependency creep] → Both dev-only; vite is the minimal way to actually serve a browser playground for a TS project, happy-dom the minimal DOM for vitest.
- [Camera concept later forces churn] → The transform seam sits between frame data and `SvgNode` construction (frame-render stage). Entity renderers and sinks are on either side of it and stay untouched; only the frame renderer composition will change.

## Open Questions

- None blocking. Camera design deferred deliberately.
