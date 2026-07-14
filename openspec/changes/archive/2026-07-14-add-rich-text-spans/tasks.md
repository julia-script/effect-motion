## 1. Text Data Model

- [x] 1.1 Define rich-text content schemas/types for an mdast-shaped `root`, multiple `paragraph` nodes, and recursive inline `text`, `strong`, and `emphasis`.
- [x] 1.2 Widen `Shapes.Text` so `text` accepts either the existing string form or the rich-text root form.
- [x] 1.3 Ensure unsupported node types fail schema validation instead of being ignored.

## 2. SVG Rendering

- [x] 2.1 Add Text renderer helpers that convert rich paragraphs and inline content into nested `SvgNode` `<tspan>` children without injecting line breaks.
- [x] 2.2 Preserve the existing plain-string render path so escaping and DOM `textContent` behavior stay unchanged.
- [x] 2.3 Map `strong` to `font-weight="bold"` and `emphasis` to `font-style="italic"`, including nested mark composition.

## 3. Tests

- [x] 3.1 Add schema tests for plain string compatibility, accepted multiple rich paragraphs, and rejected unsupported rich nodes.
- [x] 3.2 Add SVG string-render tests for multiple paragraphs, escaped plain text, bold spans, italic spans, and nested bold+italic content.
- [x] 3.3 Add DOM-render coverage proving rich paragraphs materialize as separate SVG `<tspan>` elements under the parent `<text>`.
- [x] 3.4 Confirm existing Text motion tests still pass and content remains untouched by motion.

## 4. Validation

- [x] 4.1 Run `pnpm --filter effect-motion test`.
- [x] 4.2 Run `pnpm --filter effect-motion check`.
- [x] 4.3 Run `openspec validate add-rich-text-spans`.

## 5. Documentation

- [x] 5.1 Update the live Text scene to demonstrate `strong` and `emphasis` content.
- [x] 5.2 Document plain-string, rich inline, and multiple-paragraph Text input on the Text example page.
- [x] 5.3 Run `pnpm --filter docs check`.
- [x] 5.4 Re-run `openspec validate add-rich-text-spans`.
