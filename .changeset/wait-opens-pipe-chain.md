---
"effect-motion": patch
---

`Motion.wait` works as the opening step of a pipe chain. `instance.pipe(Motion.wait(...), ...)` hung the scene with zero frames: the chain's first step receives the bare `Instance` handle, which is Pipeable but not an Effect, so the internal tap silently never resolved its phaser party. `wait` now lifts the handle through the same normalization every other animator uses, and its return type is conditional on the chain position. The earlier guidance to "place `wait` after at least one animator" is obsolete.
