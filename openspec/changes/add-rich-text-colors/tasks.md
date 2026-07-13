## 1. Text Data Model

- [x] 1.1 Add an optional `color: string` field to the `text`, `strong`, and `emphasis` inline node types and schemas.
- [x] 1.2 Keep unsupported node types and fields failing schema validation as before.

## 2. SVG Rendering

- [x] 2.1 Emit `fill` on a run's `<tspan>` when its inline node sets `color`.
- [x] 2.2 Keep uncolored runs attribute-free so entity-level `fill` inheritance is unchanged.

## 3. Tests

- [x] 3.1 Add schema tests accepting and retaining `color` on leaf and mark nodes.
- [x] 3.2 Add SVG string-render tests for colored text runs, colored marks, and uncolored runs staying `fill`-free.
- [x] 3.3 Confirm existing rich-text and motion tests still pass unchanged.

## 4. Validation

- [x] 4.1 Run `pnpm --filter effect-motion test`.
- [x] 4.2 Run `pnpm --filter effect-motion check`.
- [x] 4.3 Run `openspec validate add-rich-text-colors`.

## 5. Documentation

- [x] 5.1 Color segments in the live Text scene.
- [x] 5.2 Document per-run `color` on the Text example page.
- [x] 5.3 Run `pnpm --filter docs check`.
