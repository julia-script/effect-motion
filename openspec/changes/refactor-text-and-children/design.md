## Context

The engine carries two tree representations. The entity tree structures instances through `Group.children` — an `Array<string>` of instance ids resolved late by the renderer. `Shapes.Text`, however, carries a second, parallel tree *inside one instance's data*: a recursive rich-text schema (`root → paragraph → {text|strong|emphasis}`) that the engine treats as a special case and the SVG renderer walks into `<tspan>`s. `shapes/TextReveal.ts` does grapheme-level surgery on that inline tree; `Motion.reveal` drives it.

Two spines means two ways to express structure, and only one of them (the id-based entity tree) generalizes to what we want next: a component/JSX layer where `instantiate(<Group><Text>Hello</Text></Group>)` produces ordinary instances. It also pins preprocessing (rich-text/markdown parsing) inside the engine, on the per-frame path, where it cannot be memoized in userland.

Constraints that shape the design:

- **Determinism** (AGENTS.md): duration animations land exactly, no wall-clock/`Math.random()`, failures are loud defects. Nothing here touches timing.
- **base/To pairs, dual call forms**: unaffected — this change adds no animators.
- **effect pin** `4.0.0-beta.94`: `Schema` and `Effect` APIs as they exist there.
- Pre-release: breaking changes are free now, expensive after. The completed-but-unarchived `add-text-reveal` change is directly superseded.

## Goals / Non-Goals

**Goals:**

- One representation for structure: the id-based entity tree, built by children-defining instantiation.
- `Scene.instantiate` accepts a polymorphic `children` list (`string | Instance | Effect<Instance>`) that normalizes to stored ids, with nested `instantiate` effects yielded internally (no `yield*` at the callsite).
- Remove the parent-defining `options.parent` argument.
- A uniform, engine-owned `$visible` instance property beside entity data, with `$`-prefixed schema fields rejected.
- `Text` is a plain-string leaf; delete rich text and reveal entirely.
- Record the userland-preprocessing principle in AGENTS.md.

**Non-Goals:**

- JSX/TSX support (this change only makes the shape that enables it later).
- Lazy/reactive instances (functions of scene state, re-evaluated per frame) — the intended future replacement for text animation, deferred.
- `appendChild`/reparenting API — deferred.
- Inline non-text children of a `Text` (a Circle inside a Text) — render nothing for now; revisit post-component-system.
- Any renderer inline-flow/baseline-merging logic — out of scope; each `Text` is its own element.

## Decisions

### D1 — `children` is normalized at instantiate time; storage stays `Array<string>`

`instantiate`'s input type gains `children?: ReadonlyArray<Child>` where `Child = string | Instance.Instance | Effect.Effect<Instance.Instance>`. Inside `Runner.instantiate`, before storing data, walk the list: a string → `yield* instantiate(Shapes.Text, { text })`; an `Instance` (detected by `Instance.isInstance`) → use `.id`; otherwise it is an `Effect<Instance>` → `yield*` it, use `.id`. Replace the input `children` with the resulting `Array<string>` and construct the entity data as today. `Instance.flatten` already models the instance-or-effect resolution and is reused here.

- **Why**: the renderer already consumes `Array<string>`; keeping storage identical means zero renderer change and preserves late id-resolution + reorder-controls-paint-order. The polymorphism is purely an authoring convenience resolved at the boundary.
- **Why internal yielding**: JSX children cannot each be `yield*`-ed (`<Text>Hello {yield* <Text>World</Text>}</Text>` is not viable). Accepting `Effect<Instance>` and yielding it inside `instantiate` is the load-bearing choice that makes the future JSX shape expressible.
- **Alternatives considered**: (a) require callers to pre-yield children — rejected, blocks JSX; (b) store a polymorphic children tree and resolve in the renderer — rejected, reintroduces a second representation and moves work onto the per-frame path.

### D2 — String children default to `Shapes.Text`

A bare string becomes `Text{ text: string }`. One rule everywhere (Group, and any future container), predictable for both `richText`-style userland builders and JSX.

- **Alternatives considered**: parent-declared string-child type — rejected as YAGNI; adds machinery and surprise for a case no current entity needs.

### D3 — `$visible` lives beside data, not in the schema

Instance state grows from `{ data, entity }` to `{ data, entity, $visible: boolean }` (default `true`). It is set from a `$visible` key on the instantiate input, stripped from the input before `entity.data.make(...)`. Frames expose it per instance so renderers can skip/hide. `Entity.make` rejects any field name starting with `$`.

- **Why beside data**: keeps `$visible` off every entity's `Data["Type"]`, so it cannot clash, every entity gets it identically, and renderers get one uniform place to check. The `$` prefix documents "engine-owned, not your schema."
- **Why a guard, not a silently-shadowed key**: loud defects over silent surprises (determinism invariant). One reserved namespace (`$`) is cheaper to reason about than a growing list of reserved words.
- **Renderer behavior**: skipping vs. emitting-hidden is left to each renderer; the spec only requires the value be available. Different sinks may want different optimizations for instantiated-but-hidden nodes.
- **Alternatives considered**: reserved key `"visible"` in data — rejected; every entity author must avoid the word, and it lives in `Data["Type"]` where it can be tweened/typed inconsistently.

### D4 — `Text.text` is `Schema.String`; rich text and reveal are deleted

`TextContent`/`TextInline`/`TextParagraph` schemas, the rich-text render path in `svg/shapes.ts`, `shapes/TextReveal.ts`, `Motion.reveal` (+ options), and the reveal tests/example all go. `Text` keeps its style/trait surface. A `Text`'s non-string children render nothing.

- **Why delete rather than keep both**: the whole point is one representation. Inline formatting (`strong`/`emphasis`) and multi-run styling are better expressed later as userland components composing plain `Text` instances (and eventually JSX), not as an in-engine tree. Markdown→components can reuse existing markdown libraries entirely in userland.
- **Why drop reveal now**: its grapheme/mark machinery is built for the inline tree being deleted; a reveal over sibling `Text` instances is a different algorithm and a different feature. Text animation is deferred to the lazy/reactive-instance direction. Not essential to v1.

### D5 — Archive `add-text-reveal` before landing this

Archive the completed change first (history: shipped-then-superseded), then this change removes the code. Keeps the archive honest instead of rewriting a change that did ship.

### D6 — Document the preprocessing principle

Add to AGENTS.md: *push preprocessing to userland; the engine renders, it does not parse.* Rationale for the doc: expensive parsing (markdown, rich text) can be `memoize`d outside `Scene.make` so it runs once, never on the per-frame path — which matters when frames are computed during playback and in-scene parsing would cause frame drops.

## Risks / Trade-offs

- **Broad breaking surface (Text, `parent`, reveal)** → mitigated by pre-release timing and a mechanical migration: `{ parent }` callsites (6 files) move to children; rich `text` callsites become plain strings or `Group`s of `Text`. All within this repo; no external consumers yet.
- **Losing reveal is a visible capability regression** → accepted and explicit: removed from the roadmap's Now, reframed as a post-component-system rethink; the lazy-instance direction is noted as its successor.
- **`children` normalization introduces yielding inside `instantiate`** → low risk: `instantiate` is already an `Effect.fnUntraced` generator; nested instantiation reuses the same runner. Order is preserved by walking the list sequentially.
- **`$visible` touches the frame/state shape** → renderers that ignore it still work (they just render everything); adding skip logic is opt-in per sink. Sink-parity tests must assert both sinks agree on hidden nodes.
- **`$`-field guard could reject a legitimately-named field** → acceptable; `$` is reserved by fiat and documented. No current entity uses it.

## Migration Plan

1. Archive `add-text-reveal` (`openspec archive`), syncing its spec into `openspec/specs/`.
2. Land core changes: `instantiate` children normalization + `$visible` + `$`-guard; drop `options.parent`; `Text.text: String`; delete `TextReveal.ts`, `Motion.reveal`, rich-text render path.
3. Migrate callsites: tests (`group`, `sink-parity`, `play`, `traits`), `demo.ts`, docs scenes (`groups`, `text`, `moon-moth`), delete `reveal.scene.ts`, update `registry.ts` and `text.mdx`.
4. Update AGENTS.md (preprocessing principle) and the roadmap (move reveal/markdown/per-run styling; note JSX + lazy instances).
5. `pnpm check`, `pnpm test`, `pnpm lint:fix` green.

**Rollback**: revert the change commit; `add-text-reveal` remains archived (its code is gone but recorded). No data/persistence to unwind.

## Open Questions

- None blocking. Two directions deliberately deferred (not open for this change): JSX authoring, and lazy/reactive instances as the text-animation successor.
