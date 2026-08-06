# Tasks: IDE support package

## 1. Package skeleton

- [x] 1.1 Create `packages/ide` with a `package.json` carrying both faces: npm (`exports`, `files`, `dependencies`) and VS Code (`engines.vscode`, `activationEvents`, `contributes`, `main`), plus `tsconfig.json` / `tsconfig.build.json` / `vitest.config.ts` mirroring the sibling packages
- [x] 1.2 esbuild bundle script for the CommonJS extension entry (`vscode` external), wired into `build` after `tsc`
- [x] 1.3 `.vscodeignore` limiting the vsix to `dist/extension.cjs` and `assets/`; `vsix` script
- [x] 1.4 Extension icon
- [x] 1.5 Confirm `@effect-motion/ide` is already covered by the changesets `fixed` group's `@effect-motion/*` pattern (no config change needed)

## 2. Catalogs, computed from the library

- [x] 2.1 `Easings`: catalog with family/direction/overshoot/periodic flags and prose; `sample` calling `effect-motion/Timing` directly; themeable SVG plotter fitting overshoot inside the viewbox; data-URI encoder
- [x] 2.2 `Springs`: preset table plus a faithful mirror of `Physics`'s integrator (1/120 s substep, settle test after every substep, exact final snap), reporting samples, frames, seconds, and non-settling springs
- [x] 2.3 `Entities`: the closed entity world with own/shared fields, container and paintable flags
- [x] 2.4 `Durations`: Effect's duration grammar, and frames via `Time.toFrames`'s rule
- [x] 2.5 `scripts/sync-tw-palette.mjs` generating `src/twPalette.ts` from `Color.twMap`

## 3. Source scanners

- [x] 3.1 `Imports`: the identifiers an effect-motion export is bound to in a file (barrel and deep forms, aliases, type-only imports skipped)
- [x] 3.2 `Colors`: bracket- and string-aware scan for the six colour constructors with literal arguments; constructor-preserving `format`, with `tw` falling back to `hex`
- [x] 3.3 `Scenes`: scene declarations (through the file's own `Scene` alias) and studio/render entrypoints, for lenses
- [x] 3.4 `CallContext`: one forward scan tracking brackets, strings, and comments; suggestions keyed on argument ORDER so both dual call forms behave the same

## 4. Editor-agnostic presentation

- [x] 4.1 `Docs`: markdown for easings, springs, durations, and entities, themed
- [x] 4.2 `Docs.gallery`: a self-contained HTML page of every curve, no network access
- [x] 4.3 `Assets`: grammar and snippet paths, and the JSON catalog

## 5. Contributed data files

- [x] 5.1 Injection grammar: `L:` selector outside comments and strings; argument-terminal name matching that re-applies the base string scopes; namespace-qualified authoring calls; duration value and unit
- [x] 5.2 Snippets: scene, entities, animators, combinators, and both entrypoints — written in the current authoring form (`position: S.vec3({...})`, `fillColor`, string entity tags)

## 6. VS Code layer

- [x] 6.1 `settings`: document selector, the five toggles, frame rate, package manager, theme resolution
- [x] 6.2 Hover provider over the string literal under the cursor
- [x] 6.3 Document colour provider and presentation (picker write-back)
- [x] 6.4 Completion provider gated on `CallContext`, replacing the literal's contents
- [x] 6.5 Code lens provider
- [x] 6.6 Gallery webview and quick pick, with insert-or-copy delivery
- [x] 6.7 CLI runner: lockfile-based package-manager detection, reused terminal
- [x] 6.8 `extension.ts`: registration only; every provider gates on the effect-motion import

## 7. Tests

- [x] 7.1 Easings: catalog covers `Timing.timingFunctions` exactly; overshoot and periodic flags checked against the curves themselves; samples come from the real functions; SVG well-formed, overshoot unclipped, theme honoured; data-URI escaping
- [x] 7.2 Springs: preset table equals `Physics.springs`; frame counts equal a real `Physics.springTo` scene run (every preset, plus a second frame rate and a second distance, with the scene's own opening frame measured rather than assumed); truncation and zero-distance behaviour
- [x] 7.3 Colours: generated palette equals `Color.twMap`; every constructor read; aliases; computed, unterminated, and unknown-palette calls skipped; formatting round-trips and falls back for `tw`
- [x] 7.4 Durations: parsing and frame counts agree with `Duration`/`Time`; rejects what Effect rejects
- [x] 7.5 CallContext: both dual forms, nesting, comments, multi-line argument lists, object literals as their own scope
- [x] 7.6 Scenes: declarations, aliases, entrypoints, and every real example scene in `apps/docs/examples`
- [x] 7.7 Entities: catalog covers `Entity.EntityMap`; named fields exist on the real schemas
- [x] 7.8 Assets: grammar validity, name alternations equal to the library's, no shadowing prefixes, snippet prefixes unique and names real, catalog completeness
- [x] 7.9 Docs: markdown content per kind; gallery loads nothing from the network and shows every name

## 8. Docs, release, and the bug it turned up

- [x] 8.1 Package README, including the grammar's false-positive trade-off
- [x] 8.2 Docs page under Going Further, registered in `meta.json`
- [x] 8.3 Changeset for the new package
- [x] 8.4 Fix `Color.twMap.slate` (a verbatim copy of `fuchsia`) with its own patch changeset, and regenerate the palette

## 9. Verification

- [x] 9.1 `pnpm lint` clean at the repo root
- [x] 9.2 `pnpm --filter @effect-motion/ide test` green
- [x] 9.3 `pnpm build` and `pnpm check` green at the repo root
- [x] 9.4 `pnpm test` green at the repo root (no regression from the palette fix)
