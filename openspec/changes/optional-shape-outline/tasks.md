## 1. Model

- [x] 1.1 Split the stroke mixin: `Line` keeps black/1; filled shapes get an optional `strokeColor` with `strokeWidth` defaulting to 1

## 2. Tests

- [x] 2.1 Default Circle/Rect/Ellipse/Path data has no `strokeColor`; default Line still strokes black at width 1
- [x] 2.2 Tweening an unset `strokeColor` dies naming the field; `strokeWidth` tweens from its default
- [x] 2.3 Renderer near-zero-scale test sets its stroke explicitly

## 3. Verification

- [x] 3.1 Docs examples rendered before/after (edge-only diffs, no example relied on the outline)
- [x] 3.2 Dogfood projects rendered before/after
