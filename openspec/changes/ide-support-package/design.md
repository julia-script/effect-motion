# Design: IDE support package

## Context

The library's editor story today is whatever tsserver gives you for free, which is a lot: `EntityTag`, `TimingFunctionName`, and `SpringName` are literal unions, so completions and error checking already work with no integration at all. Any editor package therefore has to justify itself on what types cannot carry — appearance, duration, and colour — and must not duplicate what already works.

Three facts make that computable rather than curated:

- `packages/motion/src/Timing.ts` has **no imports**. It is pure arithmetic, so a preview can call the actual easing function.
- `packages/motion/src/Physics.ts` runs a fully specified integrator (explicit Euler, fixed 1/120 s substep, settle tolerance 0.001, exact final-frame snap). Its length is reproducible.
- `packages/motion/src/Color.ts` resolves every constructor through `chroma-js`. A swatch that goes through the same library is the colour that renders.

## Goals / Non-Goals

**Goals:**

- Show what types cannot: curves, frame counts, colours.
- Never disagree with the engine — every catalog and every derived number is checked against the library in tests.
- Cost nothing in TypeScript that is not effect-motion.
- Be usable outside VS Code without vendoring a copy.

**Non-Goals:**

- A language server, or anything that loads a TypeScript program. tsserver is already right about types; a second one would be slower and no more correct.
- Evaluating scene code to read its real `frameRate`, or to render a preview. Running user code to colour a hover is not a trade worth making — a preview panel is what `motion studio` is for.
- Re-implementing completions tsserver already provides. The items this package offers exist for their documentation window and deliberately sit alongside tsserver's.
- A custom language or file type. Scenes are TypeScript; the grammar is an injection, never a replacement.

## Decisions

### 1. One package, two faces

`packages/ide` is simultaneously an npm package (`exports`, `files`, ESM `dist/*.js` from `tsc`) and a VS Code extension (`engines.vscode`, `contributes`, `main` → `dist/extension.cjs` from esbuild). `.vscodeignore` keeps the vsix down to the bundle plus the contributed data files.

Two packages was the alternative — a library plus a thin extension consuming it. Rejected because the extension half is ~400 lines of pure wiring: a second `package.json`, a second changeset entry, and a workspace dependency edge to carry it would be more machinery than the code it holds. The npm/vsix duality costs one ignore file.

### 2. Real curves, mirrored springs, generated palette — three different sync strategies, one rule

The rule is that nothing is restated without a check. What differs is how the check is paid for.

- **Easings — import at runtime.** `effect-motion/Timing` is import-free, so `sample` calls the real function. Cost: nothing. Drift: impossible.
- **Springs — mirror plus an executable check.** `Physics` pulls in `Effect`, `Runner`, and `Scene`; importing it at runtime would drag the whole engine into an extension bundle to compute one frame count. `Springs.simulate` mirrors the loop instead, and `test/springs.test.ts` runs a real scene through `Physics.springTo` for every preset, at two frame rates and two distances, asserting the frame counts agree. A change to the engine's integrator fails there.
  - The scene emits one frame before any animation runs, so the test subtracts a measured baseline rather than a hard-coded `1`.
- **Tailwind palette — generated, with a drift test.** `Color.twMap` is built from 286 `oklch()` calls behind `effect`'s Schema runtime. `scripts/sync-tw-palette.mjs` flattens it to `src/twPalette.ts` (8-bit channels, ~5 KB) and `test/colors.test.ts` compares the checked-in table against the live map.
- **Catalog membership — asserted, not assumed.** The entity table, the preset table, and the grammar's three name alternations are each asserted equal to `Entity.EntityMap`, `Physics.springs`, and `Timing.timingFunctions`. A new shape or a new easing in the core fails a test here.

The one thing this bought immediately: generating the palette surfaced that `twMap.slate` was a verbatim copy of `fuchsia`.

### 3. Injection grammar: constrain by position, not by import

A TextMate injection has no way to know what a file imports, so the usual gate (`does this document import effect-motion?`) is unavailable to it. Two constraints replace it:

- The **selector is `L:`-prefixed** (`L:source.ts -comment -string`). Injections run before the base grammar, which is the only way to re-scope a string the TypeScript grammar would otherwise own; `-comment -string` keeps it out of comments and template literals.
- **Matching is argument-terminal.** A name only scopes when the whole literal is followed by `,`, `)`, `]`, or `}` — so `const mode = "linear"` is untouched while `Motion.moveTo(dot, to, "1 second", "linear")` is not. The rule consumes the quotes as well and re-applies `string.quoted.double.ts` to them, so the base grammar's appearance is preserved rather than lost.

The residual false positive is a short catalog name — `"linear"`, `"bounce"`, `"smooth"` — sitting in an unrelated call's argument list. It still renders as a string, in a different shade. That is the price of a grammar that works at all, and the README states it.

Alternatives rejected: a `begin`/`end` block over the whole call (`end: "\\)"` cannot balance nested parentheses); variable-length lookbehind for the callee (Oniguruma does not support it).

Alternation order matters for a second reason: `easeIn` before `easeInOutCubic` would match the prefix and leave the rest unscoped, so a test asserts no easing name is a prefix of a later alternative.

### 4. Completions key on argument ORDER, not index

Every animator is a dual — `Motion.moveTo(dot, to, duration, easing)` and `dot.pipe(Motion.moveTo(to, duration, easing))` are the same call at different arities — so an argument index cannot identify the easing slot. What holds across both forms is that the easing follows the duration.

`CallContext` does one forward scan to the cursor, tracking brackets, strings, and comments, and records per-frame how many preceding top-level arguments were duration-shaped literals. The rule becomes: inside a `Motion` animator, a string argument is a duration if none has been written yet and an easing otherwise. Object and array literals push their own frames, which is what stops `Scene.instantiate("Circle", { text: "|" })` from offering entity tags inside the props.

### 5. Colour edits preserve the constructor; `tw` cannot

A picker that rewrote every constructor to `hex` would quietly flatten a scene's perceptual palette. `Colors.format` therefore re-emits through the same constructor, converting via chroma. `tw` is the exception — its palette is a closed set of names and an arbitrary colour is not in it — so it falls back to `hex`, visibly, in the diff. Snapping to the nearest palette entry was rejected as too clever: a picker that silently refuses the colour you picked is worse than one that changes the call.

Calls with non-literal arguments (`Color.hex(brand)`) get no swatch at all. A wrong swatch is worse than none.

### 6. `effectMotion.frameRate` is a stated assumption, not a guess

Durations and spring lengths are only meaningful in frames, and a scene's real rate lives in `Scene.make`'s settings — reachable only by evaluating the module. The setting stands in for it, defaults to 60, and every hover that uses it names the rate it used.

### 7. Everything gates on the import

Activation is `onLanguage:typescript` (and friends), which is broad, but `activate` only registers providers and every provider's first act is `Imports.importsEffectMotion(source)` — one substring test. The grammar is the sole exception, for the reason in decision 3.

## Risks / Trade-offs

- **Grammar false positives on short names.** Mitigated by argument-terminal matching; documented in the README. Reversible: the alternation can drop `linear|sin|cos|bounce|smooth|jump|beat|plop|strike|swing` if it proves annoying.
- **The spring mirror can drift.** Mitigated by the executable check in decision 2 — but only for the presets and the two rate/distance pairs tested. A change to the integrator that only shows up at some other frame rate would pass. Accepted: the failure mode is a frame count off by a little in a hover.
- **`publisher: "julia-script"` is assumed.** The marketplace ID has not been claimed; publishing will confirm or correct it. Nothing else depends on the value.
- **Duplicate completions.** tsserver offers the same names; ours appear alongside. That is intentional (ours carry the curve) and is the standard behaviour of documentation-bearing completion providers.

## Migration Plan

Additive. No existing package changes behaviour; `Color.twMap.slate` changes colour, which is the fix its changeset describes.

## Open Questions

- Should the docs site consume `@effect-motion/ide/Easings` to render its easing reference, instead of describing curves in prose? The catalog was shaped to allow it; not scoped here.
- Is a preview panel (embedding the studio's Player in a webview) worth building later, or does `motion studio` in a browser already cover it?
