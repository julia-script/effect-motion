# Tasks: add-text-typewriter

## 1. RichText module (pure)
- [x] 1.1 `Unit`/`Marks` types, `Granularity`, `segment` via `Intl.Segmenter`
- [x] 1.2 `flatten(content, granularity)` — tree → units, marks accumulated, paragraphs → `break`
- [x] 1.3 `rebuild(units)` — units → canonical tree (strong outer / emphasis inner), plain-string fast path
- [x] 1.4 `diff(from, to)` — in-house LCS → keep/delete/insert ops (with `ponytail:` upgrade marker)
- [x] 1.5 Tests: flatten across mark boundaries, rebuild canonicalisation + idempotence, string/empty fast paths, diff correctness (prefix/suffix/middle, pure insert, pure delete, format change)

## 2. Typewriter module
- [x] 2.1 `keystrokes(from, to, options?)` — segment ops, per-region backspace-then-type, `rebuild` each state
- [x] 2.2 Tests: reveal from empty, delete to empty, single in-place edit keeps suffix, two independent edits stay local, word granularity, no-op when equal
- [x] 2.3 `typewrite` / `typewriteTo` animator pair — base/To, dual dispatch, resolves with instance
- [x] 2.4 Pacing: typing vs. backspacing speed, seeded jitter, frame-exact final state
- [x] 2.5 Tests: streamed scene reveals text over frames, lands exactly on target, seeded jitter reproducible, empty diff adds no keystroke frames

## 3. Wiring
- [x] 3.1 Export `RichText`, `Typewriter` from `packages/motion/src/index.ts`
- [x] 3.2 Docs example `apps/docs/examples/typewriter.scene.ts` + registry entry

## 4. Validate
- [x] 4.1 `pnpm --filter effect-motion test` (209 pass), `pnpm lint:fix`, `pnpm check` (all green); type guard rejects non-text entities
