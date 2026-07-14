## 1. Discard the superseded change

- [ ] 1.1 Discard `add-text-reveal` — it was never committed (12/12 tasks, but working-tree only), so there is no history to preserve. Delete its openspec dir; its working-tree code (reveal/rich-text) is removed by the tasks below. The roadmap changelog (sync 3) already records it shipped-then-superseded. (No archive: archiving a never-committed change would fabricate a landed record.)

## 2. Entity: reserve the `$` namespace

- [ ] 2.1 In `Entity.make` (`packages/motion/src/Entity.ts`), reject any schema field whose name starts with `$`, failing loudly and naming the offending field
- [ ] 2.2 Add a test asserting `$`-prefixed fields throw and ordinary fields are accepted

## 3. Instance visibility (`$visible`)

- [ ] 3.1 Extend runner instance state (`packages/motion/src/Runner.ts`) from `{ data, entity }` to `{ data, entity, $visible }`, defaulting `$visible` to `true`
- [ ] 3.2 In `instantiate`, read and strip a `$visible` key from the input before `entity.data.make(...)`, storing it beside the data
- [ ] 3.3 Expose `$visible` per instance in the frame `state` so renderers can read it
- [ ] 3.4 Have the SVG sinks (`svg/shapes.ts` / `svg/SvgDomRenderer.ts` / `svg/SvgRenderer.ts` as needed) skip an instance whose `$visible` is `false`
- [ ] 3.5 Add tests: default-visible, `$visible: false` omitted from output, and both SVG sinks agree (extend `sink-parity`)

## 4. Polymorphic children in `instantiate`

- [ ] 4.1 Define the `Child = string | Instance | Effect<Instance>` input type and thread `children?: ReadonlyArray<Child>` into the `instantiate` input types (`Scene.ts` / `Runner.ts`)
- [ ] 4.2 In `Runner.instantiate`, when `children` is present, normalize it to `Array<string>` in order: string → `instantiate(Shapes.Text, { text })`; `Instance.isInstance` → `.id`; else yield the `Effect<Instance>` and use `.id` (reuse `Instance.flatten`)
- [ ] 4.3 Ensure normalized children replace the input `children` before entity data construction, and stored `children` remains `Array<string>`
- [ ] 4.4 Add tests: string→Text child, non-yielded nested `instantiate` child, pre-instantiated child by id, mixed-order preservation, stored-as-ids shape

## 5. Remove the parent-defining hierarchy

- [ ] 5.1 Delete `InstantiateOptions.parent` and the `options.parent` branch in `Runner.instantiate` (`attach` now targets ambient parent only); drop the `options` param from `Scene.instantiate`/`Runner.instantiate` if it becomes empty
- [ ] 5.2 Migrate `{ parent }` callsites to children-defining or ambient mount: `packages/motion/src/demo.ts`, `test/group.test.ts`, `test/sink-parity.test.ts`, `test/play.test.ts`, `test/traits.test.ts`, `apps/docs/examples/groups.scene.ts`, `packages/export/test/resvg.test.ts`

## 6. Text becomes a plain-string leaf

- [ ] 6.1 In `shapes/Text.ts`, set `text: Schema.String` and delete `TextContent`/`TextInline`/`TextParagraph` (schemas and exported types)
- [ ] 6.2 Remove the rich-text render path in `svg/shapes.ts` (`textInlineToSvg`, `textParagraphToSvg`); render plain string content only
- [ ] 6.3 Update `shapes/index.ts` exports to drop the removed rich-text types
- [ ] 6.4 Update `test/text.test.ts` to plain-string assertions; verify escaping, alignment, and font-size tween scenarios still pass

## 7. Remove rich text and reveal

- [ ] 7.1 Delete `packages/motion/src/shapes/TextReveal.ts`
- [ ] 7.2 Delete `Motion.reveal` and its options from `packages/motion/src/Motion.ts` (and the `TextReveal` imports)
- [ ] 7.3 Delete `packages/motion/test/reveal.test.ts` and `packages/motion/test/text-reveal.test.ts`
- [ ] 7.4 Delete `apps/docs/examples/reveal.scene.ts`; update `apps/docs/examples/registry.ts` and `apps/docs/content/docs/examples/text.mdx` to plain-string text; update `apps/docs/examples/text.scene.ts` and `apps/docs/examples/moon-moth.scene.ts` if they use rich content
- [ ] 7.5 Remove stray artifacts (`packages/motion/_trace.mts`, dist leftovers) if present

## 8. Docs and roadmap

- [ ] 8.1 Add the userland-preprocessing principle to `AGENTS.md` ("the engine renders, it does not parse"; memoize parsing outside the scene)
- [ ] 8.2 Update `roadmaps/project.md`: move typewriter-reveal, markdown→rich-text, and per-run styling out of Now into a post-component-system rethink; note JSX and lazy/reactive instances as the future text-animation direction; add a changelog entry

## 9. Verify

- [ ] 9.1 `pnpm check` (typecheck) green across packages
- [ ] 9.2 `pnpm test` green; `pnpm lint:fix` clean
- [ ] 9.3 `openspec validate refactor-text-and-children` passes
