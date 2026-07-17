# Rounded corners on Rect

## Why

Rects can only be sharp-cornered; rounded rectangles — cards, pills, badges, lower-thirds — are among the most common motion-graphics primitives. The engine support already exists end to end (`Shape.appendRect` takes `rx`/`ry`, defaulted to 0); only the entity schema and one paint-fn call site are missing.

## What Changes

- `Shapes.Rect` gains optional, undefaulted `rx`/`ry` corner radii (SVG naming and semantics: setting only one applies it to both axes). Numeric, therefore tweenable — animating a pill into a sharp card is a plain tween.
- The rect paint fn passes them to `Shape.appendRect` on the billboard path. The tilted-plane path (projected exact polygon) cannot express rounding: a tilted Rect ignores `rx`/`ry`, documented on the entity.
- Square is left unchanged (ask again if a use case shows; it can adopt the same fields additively).

## Capabilities

### Modified Capabilities

- `shapes`: Rect's definition gains the corner-radius props (additive requirement).

## Impact

- `packages/motion`: `shapes/Rect.ts`, `render/shapes.ts` (one call), framebuffer + default tests.
- No thorvg/react/docs-structure changes; a docs mention can ride the shapes/entities page if desired later.
