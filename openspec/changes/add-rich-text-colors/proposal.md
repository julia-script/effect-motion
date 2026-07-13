## Why

Rich text on `Shapes.Text` supports bold and italic runs but offers no way to color a segment. The whole entity shares one `fill`, so common cases — highlighting one word in a title, status-colored labels — need multiple manually positioned Text instances even though SVG `<tspan>` already supports per-run `fill`.

## What Changes

- Add an optional `color` field to every rich-text inline node (`text`, `strong`, `emphasis`).
- Render a set `color` as a `fill` attribute on that run's `<tspan>`; runs without `color` keep inheriting the entity-level `fill` through normal SVG inheritance.
- Nested runs inherit an ancestor run's color unless they set their own, matching SVG semantics.
- Preserve plain-string behavior, defaults, traits, and all existing rich-text rendering unchanged.
- Document colored segments on the Text example page and in the live scene.
- Do not add color animation for individual runs; the structured content remains discrete scene data.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `text-entity`: rich-text inline nodes accept an optional per-run `color`, rendered as `fill` on the run's `<tspan>`.

## Impact

- `packages/motion/src/shapes/Text.ts`: add optional `color` to the inline node types and schemas.
- `packages/motion/src/svg/shapes.ts`: emit `fill` on the `<tspan>` for colored runs.
- `packages/motion/test/text.test.ts`: cover schema acceptance and rendered `fill` for colored runs, plus inheritance for uncolored runs.
- `apps/docs/examples/text.scene.ts` and `apps/docs/content/docs/examples/text.mdx`: demonstrate colored segments.
- No new dependency; the change stays inside the existing mdast-shaped subset (color rides as an optional style field, keeping node types unchanged).
