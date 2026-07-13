# Spec: text-entity (delta)

## MODIFIED Requirements

### Requirement: Text accepts plain or rich inline content
`Shapes.Text` SHALL require `text` content with no default. The `text` value SHALL accept either a plain string or a structured rich-text tree. The rich-text tree SHALL use a `{ type: "root", children }` node containing any number of `{ type: "paragraph", children }` nodes. Paragraph descendants SHALL be limited to inline `{ type: "text", value }`, `{ type: "strong", children }`, and `{ type: "emphasis", children }` nodes. Every inline node SHALL accept an optional `color` string. Existing shape props, `fontSize`, `fontFamily`, `textAnchor`, `baseline`, `~position`, and `~opacity` behavior SHALL remain entity-level behavior for the whole Text instance.

#### Scenario: Plain string remains valid
- **WHEN** a Text is instantiated with `text: "hi"` and no other props
- **THEN** the data is accepted with the same defaults for position, fill, opacity, font size, and font family as before

#### Scenario: Multiple rich paragraphs are accepted
- **WHEN** a Text is instantiated with a root containing multiple paragraphs with text, strong, and emphasis inline nodes
- **THEN** the data is accepted and retains the structured content tree

#### Scenario: Colored inline nodes are accepted
- **WHEN** a Text is instantiated with rich content whose inline `text`, `strong`, or `emphasis` nodes carry a `color` string
- **THEN** the data is accepted and retains each node's `color`

#### Scenario: Unsupported rich node is rejected
- **WHEN** a Text is instantiated with an unsupported rich-text node type such as `heading`, `link`, or `inlineCode`
- **THEN** schema validation fails

### Requirement: Text renders to SVG text on both sinks
The SVG target SHALL render Text as a `<text>` element carrying `x`, `y`, `font-size`, `font-family`, the optional `text-anchor`/`dominant-baseline` when set, and the shared style attributes. Plain string content SHALL render as the element's text, escaped by the string sink and set as `textContent` by the DOM sink. Structured rich-text content SHALL render inside the same `<text>` element as SVG `<tspan>` descendants. Each paragraph SHALL retain its own neutral `<tspan>` boundary and document order without an automatically inserted separator or line break. Literal `\n` content SHALL be preserved. `strong` content SHALL render bold, `emphasis` content SHALL render italic, and nested strong/emphasis marks SHALL compose. An inline node with `color` SHALL render `fill` with that value on its `<tspan>`; inline nodes without `color` SHALL emit no `fill` so runs inherit color from the nearest colored ancestor run or the entity-level `fill`.

#### Scenario: Content is escaped
- **WHEN** a Text with plain string content `a < b & c` is rendered by the string sink
- **THEN** the markup contains `a &lt; b &amp; c` inside a `<text>` element

#### Scenario: Optional alignment props are omitted when unset
- **WHEN** a Text without `textAnchor`/`baseline` is rendered
- **THEN** no `text-anchor` or `dominant-baseline` attributes are emitted

#### Scenario: Centered text
- **WHEN** a Text has `textAnchor: "middle"` and `baseline: "middle"`
- **THEN** the rendered element carries `text-anchor="middle"` and `dominant-baseline="middle"`

#### Scenario: Strong content renders bold
- **WHEN** a Text has rich content with a `strong` inline node
- **THEN** the SVG output contains a `<tspan>` for that content with `font-weight="bold"`

#### Scenario: Emphasis content renders italic
- **WHEN** a Text has rich content with an `emphasis` inline node
- **THEN** the SVG output contains a `<tspan>` for that content with `font-style="italic"`

#### Scenario: Nested marks compose
- **WHEN** a Text has rich content where emphasized content contains strong content
- **THEN** the marked content renders with both italic and bold styling

#### Scenario: Colored run carries fill
- **WHEN** a Text has rich content with an inline node whose `color` is set
- **THEN** that node's `<tspan>` carries `fill` with the given color, composed with any bold/italic attributes of the same node

#### Scenario: Uncolored runs inherit
- **WHEN** a Text has rich content with inline nodes that do not set `color`
- **THEN** those `<tspan>` elements carry no `fill` attribute and inherit color from the nearest colored ancestor run or the entity-level `fill`

#### Scenario: Multiple paragraphs retain order without automatic layout
- **WHEN** a Text has a rich root containing multiple paragraphs
- **THEN** each paragraph renders in document order as a separate neutral `<tspan>` without an injected separator or line break
