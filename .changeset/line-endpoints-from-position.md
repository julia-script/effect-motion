---
"@effect-motion/renderer": patch
---

`Line` composes both endpoints from its `position`. The renderer ignored `start` entirely and reconstructed the far endpoint as if `end` were absolute — recovering the ancestor offset via `world - position` and adding `end` to that, which only happened to work while `start` sat at the origin. A line carrying both corners in `start`/`end` with `position` at the origin collapsed: every edge drew from the scene origin to its end corner instead of spanning the two corners. Each endpoint is now `world + its own offset`, so a zero/zero line is a point at `position`.
