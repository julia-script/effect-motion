# Tasks: add-text-font-fallback

## 1. Implementation

- [ ] 1.1 Add the generic→fallback expansion map and apply it to `font-family` in the `text` render function in `packages/motion/src/svg/shapes.ts` (exact-match on trimmed lone generic; everything else passes through)

## 2. Tests

- [ ] 2.1 Test default `fontFamily` emits `font-family="Helvetica, Arial, DejaVu Sans, sans-serif"` (string sink)
- [ ] 2.2 Test `serif` and `monospace` expand to their named-first lists
- [ ] 2.3 Test pass-through: named family (`Inter`), list (`Inter, sans-serif`), and unmapped generic (`cursive`) emit unchanged
- [ ] 2.4 Run the motion package test suite (`pnpm --filter effect-motion test` or `vitest run` in `packages/motion`) and confirm green
