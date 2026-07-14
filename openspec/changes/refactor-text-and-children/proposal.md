## Why

The engine carries two tree representations. The **entity tree** structures instances through `Group.children` (an array of instance ids, resolved late by the renderer). But `Shapes.Text` carries a **second, parallel tree** inside one instance's data: a recursive `root → paragraph → {text|strong|emphasis}` rich-text schema that the engine treats specially and the renderer walks into `<tspan>`s. That duplicate spine blocks the direction we actually want — a single, uniform entity tree that a future JSX/component layer (`instantiate(<Group><Text>Hello</Text></Group>)`) can produce, and that lets all preprocessing (markdown, rich text) move to userland where it can be memoized outside the per-frame path.

Before release — while breaking changes are still free — we collapse to one representation: the engine knows only `Group` and a plain-string `Text`, styling is ordinary entity data, and structure is defined by *children*, not by a parent argument.

## What Changes

- **Polymorphic children in `instantiate`.** `Scene.instantiate(entity, { children: [...] })` accepts a heterogeneous `children` list of `string | Instance | Effect<Instance>`. Strings auto-instantiate into `Text`; `Effect<Instance>` values are yielded internally (no `yield*` required at the call site — the JSX-enabling choice); `Instance` values contribute their id. The **stored** `children` stays `Array<string>` (renderer unchanged). **BREAKING** for any entity whose input previously rejected a `children` key.
- **Remove the parent-defining hierarchy.** **BREAKING** — delete the `options.parent` argument on `Scene.instantiate` / `Runner.instantiate`. Structure is defined by children, not by naming a parent. The ambient mount parent (`CurrentParent`, used by `Scene.play({ parent })`) is unaffected. `appendChild`-style mutation is explicitly out of scope for later.
- **`$visible` builtin instance prop.** A namespaced, engine-owned instance property living *beside* entity data (not in the entity schema), settable at instantiate as `{ $visible: false }`, defaulting to `true`. `Entity.make` SHALL reject any entity schema field whose name starts with `$`. Every entity gets consistent visibility for free; renderers MAY skip hidden nodes.
- **Text becomes a plain-string leaf.** **BREAKING** — delete `TextContent` / `TextInline` / `TextParagraph`; `Text.text` is `Schema.String`. A `Text`'s children are strings only; non-string children of a Text render nothing (a documented v1 limitation, revisitable once a component system lands).
- **Remove rich text and reveal entirely.** **BREAKING** — delete `shapes/TextReveal.ts`, `Motion.reveal` and its options, the `reveal`/`text-reveal` tests, and the `reveal.scene.ts` example; simplify the `text` docs and example to plain strings. Text animation (typewriter/reveal), markdown→components, and per-run styling are deferred to a post-component-system rethink; JSX and lazy/reactive instances are the intended future replacements.
- **Archive the superseded `add-text-reveal` change** (completed but unarchived) first, so history records it shipped-then-superseded rather than editing it away.
- **Document the preprocessing principle** in AGENTS.md: push parsing/preprocessing to userland; the engine renders, it does not parse — so expensive work (markdown parsing, rich-text building) can be memoized outside the scene and never runs on the per-frame path.

## Capabilities

### New Capabilities
- `instance-children`: `Scene.instantiate` accepts a polymorphic `children` list (`string | Instance | Effect<Instance>`), normalizing it to stored child ids; strings default to `Text`; nested instantiate effects are yielded internally.
- `instance-visibility`: a builtin `$`-namespaced instance property (`$visible`) held beside entity data, defaulting to visible, with `$`-prefixed entity schema fields rejected at `Entity.make`.

### Modified Capabilities
- `text-entity`: `text` becomes a plain string; the rich-text tree (`root`/`paragraph`/`strong`/`emphasis`) and its `<tspan>` rendering requirements are removed.
- `scene-mounting`: the explicit `options.parent` instantiation argument is removed; the ambient current-parent (mount) behavior is retained.
- `shapes`: the `Group` requirement drops the `parent` instantiation argument and describes children-defined structure; `$visible` is introduced as a uniform instance-level property.

## Impact

- **Core (`packages/motion`):** `Scene.ts`/`Runner.ts` (instantiate signature, children normalization, `$visible` state, drop `parent`), `Entity.ts` (`$`-field guard), `shapes/Text.ts` (plain string), delete `shapes/TextReveal.ts`, `Motion.ts` (delete `reveal`), `shapes/index.ts`, `svg/shapes.ts` (drop rich-text render path), possibly `svg/SvgDomRenderer.ts` / renderers (skip `$visible: false`).
- **Tests:** delete `reveal.test.ts`, `text-reveal.test.ts`; update `text.test.ts`, `group.test.ts`, `sink-parity.test.ts`, `play.test.ts`, `traits.test.ts`, `demo.ts` (migrate `{ parent }` callsites to children); `packages/export/test/resvg.test.ts`.
- **Docs (`apps/docs`):** delete `reveal.scene.ts`; update `text.scene.ts`, `groups.scene.ts`, `moon-moth.scene.ts`, `content/docs/examples/text.mdx`, `examples/registry.ts`.
- **Specs:** modify `text-entity`, `scene-mounting`, `shapes`; add `instance-children`, `instance-visibility`.
- **Roadmap & AGENTS.md:** move reveal / markdown→richtext / per-run styling out of Now; add the userland-preprocessing principle; note JSX + lazy instances as future directions.
