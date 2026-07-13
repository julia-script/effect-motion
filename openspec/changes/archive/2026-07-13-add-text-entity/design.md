# Design: Text entity

## Context

Entities are `Entity.make(name, schemaFields, traits)` (see `shapes/Path.ts` for the required-string-prop precedent); SVG rendering is one `RenderFunction<SvgNode, Ent>` registered via `entityRendererLayer` in `svg/shapes.ts`'s `shapesLayer`. `SvgNode.children` already supports a string for text content, and both sinks already implement it (escaped in the string sink, `textContent` in the DOM sink) — no infrastructure work needed.

## Goals / Non-Goals

**Goals:** a single-line, single-style text run mirroring SVG `<text>`, animatable through existing traits and tweens, with alignment usable without text measurement.

**Non-Goals:** rich text (styled runs/`tspan`, wrapping, per-character layout) — future SEPARATE entity, this one never grows those flags; text measurement/font metrics (the blocker for layout and proper per-character animation — first concrete consumer is staggered-letter motion, revisit with rich text); `fontWeight` (string/number union fights `InterpolableOnly`; add when needed); cross-viewer pixel determinism (requires font embedding).

## Decisions

- **`text` is required, no default.** The visible-defaults doctrine says a default-constructed shape must be visible; empty text can't be, and a placeholder default ships lorem-ipsum bugs. Same reasoning as `Path.d`.
- **`fontSize: defaultedNumber(16)`.** Numeric, so it is tweenable for free (`tweenTo({ fontSize })` — pop-in titles day one).
- **`fontFamily` defaults to the generic `"sans-serif"` keyword** (user decision): guaranteed to resolve everywhere as a sane system sans, unlike any named font; emitted always (constructor default, not optional) so standalone SVG output doesn't depend on context styling.
- **`textAnchor` (`start`/`middle`/`end`) and `baseline` (`auto`/`middle`/`hanging`) ship now** as optional literal props mapping to `text-anchor`/`dominant-baseline`. Without them, centered text — the most common motion-graphics placement — is impossible rather than one prop; they are also the mitigation for the no-measurement limitation. Omitted → not emitted (SVG defaults apply).
- **Renderer:** `tag: "text"`, props `x`, `y`, `font-size`, `font-family`, optional `text-anchor`/`dominant-baseline`, shared `styleAttrs`; `children: data.text`. Escaping is the sinks' existing job — the render test must cover `<` and `&` in content anyway.

## Risks / Trade-offs

- [No measurement surprises users expecting centering-by-math or wrapping] → documented limitation; `textAnchor`/`baseline` cover alignment; wrapping is out of scope by definition (SVG `<text>` doesn't wrap either).
- [`fontSize` interacts with `baseline: "middle"` differently across viewers for extreme sizes] → inherent to SVG `dominant-baseline`; not our bug.
