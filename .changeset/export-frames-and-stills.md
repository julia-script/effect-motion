---
"@effect-motion/export": minor
---

Headless frame sampling: `Frames` selects frames by index, time, percentage or `end` (or `count N`, optionally over a range) and serializes their state as JSON; `Stills` renders frames to PNG stills or a contact sheet. Both are also available as the `@effect-motion/export/Frames` and `@effect-motion/export/Stills` subpaths, so JSON sampling does not load the GPU renderer.
