---
"@effect-motion/cli": patch
"@effect-motion/export": patch
---

`motion frames` now says why a scene failed: the scene list shows `failed to run: <cause>` (e.g. `TypeError: iter.next is not a function` for an `Effect.fn` passed to `Scene.make`), and sampling or rendering errors end with the same one-line cause, including defects that used to escape as a raw trace. `--verbose` adds the full cause chain with stacks. `@effect-motion/export/Video` is now a deep-import subpath next to `/Frames` and `/Stills`, and the API reference gains the `@effect-motion/export` pages.
