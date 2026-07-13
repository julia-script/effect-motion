## Context

`Shapes.Text` accepts a plain string or an mdast-shaped rich-text tree (`root` → `paragraph` → inline `text`/`strong`/`emphasis`). Inline runs render as nested `<tspan>` nodes with fixed bold/italic mapping; the only color is the entity-level `fill` on the parent `<text>` element. SVG `<tspan>` accepts its own `fill`, and `fill` inherits down the tree, so per-run color needs no new rendering machinery.

## Goals / Non-Goals

**Goals:**

- Let any inline run declare its own color without changing the tree shape.
- Keep uncolored runs inheriting the entity's `fill` exactly as before.
- Let colors compose with bold/italic marks and with nesting.

**Non-Goals:**

- No tweening/animation of per-run colors (structured content stays discrete).
- No new inline node type for color.
- No validation of color strings beyond being strings (same stance as the entity-level `fill`).

## Decisions

1. Color is an optional field on existing inline nodes, not a wrapper node.

   ```ts
   type TextInline =
     | { readonly type: "text"; readonly value: string; readonly color?: string }
     | { readonly type: "strong"; readonly children: ReadonlyArray<TextInline>; readonly color?: string }
     | { readonly type: "emphasis"; readonly children: ReadonlyArray<TextInline>; readonly color?: string };
   ```

   Rationale: a `{ type: "color" }` wrapper node would break the mdast-shaped node set and force extra nesting to color a bold word. An optional style field keeps the node types identical to the accepted mdast subset — future Markdown normalization can simply never set it — and coloring any run is a one-key edit.

2. `color` maps to `fill` on the run's `<tspan>`; absence emits nothing.

   Uncolored runs keep the current attribute-free `<tspan>` output, so entity-level `fill` inheritance and all existing rendering stay byte-identical. Nested inheritance (a colored `emphasis` tinting its children until one overrides) falls out of standard SVG `fill` inheritance rather than any merging logic.

3. The field is named `color`, not `fill`.

   Inline nodes describe content-level intent ("this word is green"), while `fill`/`stroke` are shape-level paint props on the entity. Keeping the names distinct avoids implying the full paint surface (stroke, stroke-width) is available per run.

## Risks / Trade-offs

- Per-run colors are not tweenable -> consistent with rich content being discrete scene data; entity `fill` remains the animatable color.
- Color strings are unvalidated -> matches `fill` on every shape; invalid values degrade the same way they would entity-wide.
