# Tasks — text-spans-highlight

## 1. Core: spans on Text

- [x] 1.1 Add `Span` schema and optional `spans` field to the Text struct in `packages/motion/src/Entity.ts`, with the struct-level check (non-empty, in-bounds, ascending, non-overlapping; failures name the span index); revise the "composing several Texts" doc comment
- [x] 1.2 Core tests: valid spans stored, each violation class rejected, span-less Text unchanged (`packages/motion/test`)

## 2. Renderer: per-range colored glyphs

- [x] 2.1 Verify the published `@text-rendering-toolkit` version used by `packages/renderer` ships `styleRanges` + `styleColors`; bump if the sibling checkout is ahead
- [x] 2.2 Extend `packages/renderer/src/Text.ts`: `LayoutRequest` gains spans → `styleRanges` with index-keyed styles sharing font/size; `TextMesh` gains span-color updates flowing to `GlyphText.styleColors`; wrap grapheme-boundary layout failures in a typed error naming the span
- [x] 2.3 Extend the text entity renderer in `packages/renderer/src/Builtins.ts`: span boundaries join the layout key, span colors join the color key (color-only changes commit without re-layout)
- [x] 2.4 Renderer tests: spanned string renders with per-range colors at unchanged glyph positions; color-only frame change does not re-shape; ligature forms within a span and not across a boundary

## 3. Package: @effect-motion/code

- [x] 3.1 Scaffold `packages/code` (`@effect-motion/code`): package.json (deps `@lezer/common` + `@lezer/highlight`, peer `effect-motion`), tsconfig, vitest config aliasing core source (mirror `packages/react`), turbo wiring, changeset
- [x] 3.2 Implement `highlight(code, parser, theme)`: `highlightTree` over the parse, theme as plain `Record<tagName, Color>`, maximal same-color runs, unthemed tags emit no span; export a default theme object
- [x] 3.3 Implement `dim(highlighted, ranges, { background, amount, baseColor })`: whole-string span derivation, kept ranges preserved, remainder Lab-mixed toward background
- [x] 3.4 Implement `selectTo` on `Motion.drive`: fixed union boundaries computed at start, per-frame color interpolation, exact target set on the final frame; dual call forms per AGENTS.md
- [x] 3.5 Package tests with a dev-dependency `@lezer/javascript`: tokenization snapshot, determinism (two runs deeply equal), dim derivation, `selectTo` frame-exactness via `Scene.run`

## 4. Docs

- [x] 4.1 Runnable example in `apps/docs/examples`: highlighted TypeScript snippet with an animated selection sweep; register in `examples/registry.ts`
- [x] 4.2 MDX page for code highlighting under `content/docs/` (spans on Text, themes, selection); note the monospace-not-required and ligature-boundary behavior
