## Context

`Shapes.Text` currently stores `text` as `Schema.String` and renders it as a single SVG `<text>` node whose `children` is that string. This keeps escaping sink-owned: the string SVG sink escapes text content, and the DOM sink assigns text through `textContent`.

The SVG renderer abstraction already supports nested `SvgNode` children, so inline `<tspan>` output does not require a new scene-graph entity. The main design change is the Text data contract: `text` needs to accept plain strings and a small structured content tree that can later be produced from Markdown/mdast.

## Goals / Non-Goals

**Goals:**

- Preserve the existing `text: string` API and output behavior.
- Add an mdast-shaped rich-text form with a `root`, multiple `paragraph` nodes, and inline `text`, `strong`, and `emphasis` nodes.
- Render `strong` as bold `<tspan>` content and `emphasis` as italic `<tspan>` content in both SVG sinks.
- Keep rich text inside one `Shapes.Text` instance so position, opacity, font size, and alignment remain entity-level concerns.

**Non-Goals:**

- No Markdown parser or Markdown string input.
- No automatic paragraph/line layout, wrapping, text measurement, or baseline math.
- No standalone `Tspan` entity.
- No custom per-run styling beyond fixed bold/italic mapping.
- No animation of sub-runs independent from their parent Text entity.

## Decisions

1. Keep `text` as the public field and widen its type.

   Use a small discriminated union:

   ```ts
   type TextContent =
     | string
     | { readonly type: "root"; readonly children: ReadonlyArray<TextParagraph> };

   type TextParagraph = {
     readonly type: "paragraph";
     readonly children: ReadonlyArray<TextInline>;
   };

   type TextInline =
     | { readonly type: "text"; readonly value: string }
     | { readonly type: "strong"; readonly children: ReadonlyArray<TextInline> }
     | { readonly type: "emphasis"; readonly children: ReadonlyArray<TextInline> };
   ```

   Rationale: this keeps existing scenes source-compatible while creating a direct target for future Markdown parsing. A separate `richText` field would create two content sources that need precedence rules. A standalone `Tspan` entity would incorrectly give inline formatting scene identity, traits, and hierarchy.

2. Treat this as an mdast-shaped subset, not an mdast dependency.

   The accepted node names intentionally match mdast concepts, but the library should not add `mdast`, `remark`, or `unified` dependencies for this change. Future Markdown support can parse outside the Text entity and normalize into this subset.

3. Render strings through the existing string-child path.

   For `text: "a < b"`, the renderer should keep returning `children: "a < b"` so existing escaping and DOM behavior remain unchanged.

4. Render structured content as nested SVG nodes.

   For a rich root, the renderer should convert each paragraph into a neutral `<tspan>` under the existing `<text>` node, preserving paragraph order and boundaries without injecting whitespace or line breaks. Plain `text` nodes become string-preserving leaf content inside `<tspan>` nodes. Literal `\n` values remain content owned by the sinks. `strong` adds `font-weight="bold"`; `emphasis` adds `font-style="italic"`. Nested marks should compose by nesting or merging attributes so bold+italic content renders with both styles.

5. Reject unsupported rich-text nodes at schema construction.

   Only a top-level `root`, its `paragraph` children, and inline `text`, `strong`, and `emphasis` nodes are valid. Unsupported mdast nodes such as `heading`, `link`, `delete`, `break`, `inlineCode`, and nested `paragraph` inside inline nodes should fail schema validation rather than being silently ignored.

## Risks / Trade-offs

- Paragraph boundaries are structural only -> The renderer preserves order and literal `\n` content but does not add visual line layout; SVG whitespace behavior remains sink/platform-defined until explicit line layout is added.
- Structured content is not tweenable -> This matches the current animation model; numeric Text fields still tween normally while content remains discrete scene data.
- SVG whitespace behavior can surprise callers -> Tests should pin basic adjacency behavior (`"hello " + bold + " world"`) and escaping so implementation changes do not drop spaces.
- Nested marks can create verbose SVG -> Prefer correctness and simple recursion; optimize output shape only if it becomes a real problem.
