## 1. Structure & navigation

- [x] 1.1 Design the new nav: rewrite `apps/docs/content/docs/meta.json` for the concept spine (Introduction, Getting started, Core Concepts group, Going Further group, Examples gallery, Patterns). Add section `meta.json` files for the Core Concepts and Going Further folders.
- [x] 1.2 Decide the fate of the current `content/docs/examples/*.mdx` gallery pages (dissolve into concept pages vs. keep thin) and the `made-by-*` showcase pages (keep as the Examples gallery).

## 2. New example scenes (new APIs)

- [x] 2.1 Add a `children`-composition scene (`apps/docs/examples/children.scene.ts`) — a Group built from a polymorphic `children` list (string → Text, nested instantiate, an instance) — and register it.
- [x] 2.2 Add an `appendChild` reparent scene (lazily-created node moved into a group) and register it.
- [x] 2.3 ~~Add a custom-entity scene~~ → **resolved: no live scene**. the docs Player hardcodes only the built-in shapes layer (`Player.tsx:19`) and `PlayerProps` has no layer override, so a custom entity cannot render in `<Example>`. The custom-entity page (4.1) uses a **code sample only**, verified out-of-band. (No library change — matches the docs-only scope.)

## 3. Core Concepts pages

- [x] 3.1 **Scenes & the frame model** — `Scene.make`; `run` (frame list) / `stream` (lazy) / `step`; `Settings` (frameRate/width/height/backgroundColor/seed/maxFrames). Explain the pure-function-of-(scene,settings) model.
- [x] 3.2 **Entities & instances** — the 8 built-in shapes; `instantiate`; polymorphic `children`; `$visible`; `appendChild`/`removeChild`; `update`/`data`. Embed the children + appendChild examples. `Text` documented as a plain-string leaf composed via children.
- [x] 3.3 **Animators** — base/To pair pattern, dual call forms; `tween`/`tweenTo` (raw) vs `move`/`fade` (semantic); `wait`. Embed a relevant example (e.g. crossfade / easing).
- [x] 3.4 **Physics** — `spring`/`springTo`, presets (`Physics.springs`), why there's no duration. Embed the springs example.
- [x] 3.5 **Timing & easing** — the curve library (named curves, factory curves, custom `(t)=>t` functions), `timingFunctions`. Embed the easing-race example.
- [x] 3.6 **Composition** — `chain`/`all`/`stagger`/`fork`/`background`/`repeat`, plus `play` (nested scenes) and `finish`. Embed chain/stagger/fork-background/repeat examples.
- [x] 3.7 **Determinism** — `seed`, the seeded `Random`, frame-exact invariants (duration lands on target, springs snap on settle). Embed the seeded-randomness example.

## 4. Going Further pages

- [x] 4.1 **Custom entities** — `Entity.make` with fields + trait lenses + a render function registered on a sink. Embed the custom-entity example.
- [x] 4.2 **Rendering & sinks** — `SvgRenderer` (self-contained string, the export path) vs `SvgDomRenderer` (live DOM, clear-and-rebuild). When to use which.
- [x] 4.3 **React Player** — `usePlayer` / `Player`; how a scene becomes something on screen in a user's app (live consumption). Pair conceptually with Export.
- [x] 4.4 **Export to video** — update the existing `export.mdx`: resvg → ffmpeg pipeline, `Video.render`, and the bundled-ffmpeg default with the `binary` override. Ensure it matches the export README.
- [x] 4.5 **Fonts** — the `Fonts` annotation, player (FontFace) and export (resvg) paths. Embed the custom-fonts example. (Largely a relocation/accuracy pass of existing content.)

## 5. Accuracy pass on existing pages

- [x] 5.1 `text` — plain-string `Text` + composition via children; remove all rich-text tree / `strong` / `emphasis` / `Motion.reveal` references (fold into Entities page or keep as a short Text section).
- [x] 5.2 `getting-started`, `index`, `pacing`, `composition` — audit against the current API; fix any pre-refactor structure (`parent` arg) or removed-feature references.
- [x] 5.3 Showcase scenes (`moon-moth`, `the-box`) pages — confirm prose matches the current scene source (they were migrated during the refactor).

## 6. Patterns (fast-follow, lower priority)

- [ ] 6.1 **Deferred (out of scope for this change).** A Patterns page of recipes (loop forever, crossfade, stagger into a group, styled/multi-line text via children). Explicitly optional/fast-follow from the start; all publish-gating pages shipped without it. Pick up as a small future change if wanted.

## 7. Verify

- [x] 7.1 `pnpm docs` (dev) — every page renders, every embedded `<Example>` plays, navigation reflects the concept spine.
- [x] 7.2 `pnpm --filter docs build` (or `pnpm build`) green — no broken MDX, no missing example names.
- [x] 7.3 Coverage check: every symbol in the spec's Full public-API coverage requirement has a documented home; no page references removed APIs.
- [x] 7.4 `openspec validate improve-docs-coverage` passes.
