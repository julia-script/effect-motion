## Why

`Shapes.Text` can only render one uniformly styled string today, which makes common title and label cases awkward as soon as one word needs emphasis. SVG already supports inline text runs through `<tspan>`, and the existing `SvgNode` renderer contract can already materialize nested nodes, so this is a small capability expansion with a clear future path toward Markdown input.

## What Changes

- Expand `Shapes.Text` content from plain strings only to either a string or a limited rich-text tree shaped like a small mdast subset.
- Support an mdast-shaped `root` with multiple `paragraph` children, whose inline content is limited to `text`, `strong`, and `emphasis`.
- Render `strong` as bold SVG `<tspan>` content and `emphasis` as italic SVG `<tspan>` content.
- Preserve existing plain-string behavior, defaults, traits, tweenable numeric props, and alignment props.
- Document plain strings, rich inline marks, and multiple paragraph input through the existing Text example page.
- Do not add Markdown parsing, automatic paragraph/line layout, text measurement, or custom per-run styling in this change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `text-entity`: Text content and SVG rendering now support a limited rich-text tree in addition to a plain string.

## Impact

- `packages/motion/src/shapes/Text.ts`: widen the `text` schema/type to accept the rich-text subset while keeping strings valid.
- `packages/motion/src/svg/shapes.ts`: convert rich-text content into nested SVG `<tspan>` nodes.
- `packages/motion/test/text.test.ts`: cover schema acceptance, string compatibility, escaping, bold spans, italic spans, and nested mark composition.
- `apps/docs/examples/text.scene.ts` and `apps/docs/content/docs/examples/text.mdx`: demonstrate plain and structured Text content.
- No new runtime dependency is expected for this change; Markdown parsing can be layered on later by converting mdast into the same accepted subset.
