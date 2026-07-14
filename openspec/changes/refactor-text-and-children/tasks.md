## 1. Discard the superseded change

- [x] 1.1 Discard `add-text-reveal` — it was never committed (12/12 tasks, but working-tree only), so there is no history to preserve. Delete its openspec dir; its working-tree code (reveal/rich-text) is removed by the tasks below. The roadmap changelog (sync 3) already records it shipped-then-superseded. (No archive: archiving a never-committed change would fabricate a landed record.)

## 2. Entity: reserve the `$` namespace

- [x] 2.1 In `Entity.make` (`packages/motion/src/Entity.ts`), reject any schema field whose name starts with `$`, failing loudly and naming the offending field
- [x] 2.2 Add a test asserting `$`-prefixed fields throw and ordinary fields are accepted

## 3. Instance visibility (`$visible`)

- [x] 3.1 Extend runner instance state (`packages/motion/src/Runner.ts`) from `{ data, entity }` to `{ data, entity, $visible }`, defaulting `$visible` to `true`
- [x] 3.2 In `instantiate`, read and strip a `$visible` key from the input before `entity.data.make(...)`, storing it beside the data
- [x] 3.3 Expose `$visible` per instance in the frame `state` so renderers can read it (optional in `FrameEntry`; absent = visible)
- [x] 3.4 Skip `$visible: false` in the target-agnostic render fold (`Renderer.ts`), so every sink honors it
- [x] 3.5 Add tests: default-visible + carried on frame, hidden instance skipped (group.test), both sinks agree (sink-parity)

## 4. Polymorphic children in `instantiate`

- [x] 4.1 Define the `Child = string | Instance | Effect<Instance>` input type and thread `children?: ReadonlyArray<Child>` into the `instantiate` input types (`Scene.ts` / `Runner.ts` via `InstantiateProps`)
- [x] 4.2 In `Runner.instantiate`, when `children` is present, normalize it to `Array<string>` in order: string → `instantiate(Shapes.Text, { text })`; `Instance.isInstance` → `.id`; else yield the `Effect<Instance>` and use `.id`
- [x] 4.3 Ensure normalized children replace the input `children` before entity data construction, and stored `children` remains `Array<string>`
- [x] 4.4 Add tests: string→Text child, non-yielded nested `instantiate` child, pre-instantiated child by id, mixed-order preservation

## 5. Remove the parent-defining hierarchy; HTML-style node mutation

- [x] 5.1 Delete `InstantiateOptions.parent` and the `options` param from `Scene.instantiate`/`Runner.instantiate`; `attach` targets the ambient parent only
- [x] 5.2 Migrate `{ parent }` callsites: `demo.ts`, `test/group.test.ts`, `test/sink-parity.test.ts`, `test/play.test.ts`, `test/traits.test.ts`, `packages/export/test/resvg.test.ts` (docs `groups.scene.ts` in task 7.4)
- [x] 5.3 Add HTML-style node mutation (design D4a): per-instance parent tracking (`parentOf`), `Scene.appendChild`/`removeChild` with O(1) detach-then-attach; children lists adopt their members; `destroy` uses O(1) detach + backstop scan. Tests in group.test (`appendChild reparents`, adopt)

## 6. Text becomes a plain-string leaf

- [x] 6.1 In `shapes/Text.ts`, set `text: Schema.String` and delete `TextContent`/`TextInline`/`TextParagraph`
- [x] 6.2 Remove the rich-text render path in `svg/shapes.ts`; render plain string content only
- [x] 6.3 Update `shapes/index.ts` exports to drop the removed rich-text types
- [x] 6.4 Update `test/text.test.ts` to plain-string assertions (defaults, required, non-string rejected, escaping, newlines, alignment, motion, fontSize tween)

## 7. Remove rich text and reveal

- [x] 7.1 Delete `packages/motion/src/shapes/TextReveal.ts`
- [x] 7.2 Delete `Motion.reveal` and its options from `packages/motion/src/Motion.ts` (and the `TextReveal`/`TextContent` imports)
- [x] 7.3 Delete `packages/motion/test/reveal.test.ts` and `packages/motion/test/text-reveal.test.ts`
- [x] 7.4 Delete `apps/docs/examples/reveal.scene.ts`; update `registry.ts` and `text.mdx` to plain-string/composition; migrate `text.scene.ts`, `moon-moth.scene.ts`, `groups.scene.ts`, `the-box.scene.ts` off rich content / `{ parent }`
- [x] 7.5 Remove stray artifacts (`packages/motion/_trace.mts`)

## 8. Docs and roadmap

- [x] 8.1 Add the userland-preprocessing principle to `AGENTS.md` ("the engine renders, it does not parse"; memoize parsing outside the scene); document the node model (children / appendChild) and `$visible`
- [x] 8.2 Update `roadmaps/project.md` (done in the sync-3 roadmap-sync before apply)

## 9. Verify

- [ ] 9.1 `pnpm check` (typecheck) green across packages
- [ ] 9.2 `pnpm test` green; `pnpm lint:fix` clean
- [x] 9.3 `openspec validate refactor-text-and-children` passes
