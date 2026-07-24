---
"effect-motion": patch
---

A scene whose body is only `Scene.background(...)` no longer deadlocks. A startup race let the scene's end-check run before the background branch registered, leaving playback blocked forever with zero frames and no error. The end path now races against the scene fiber and re-enters when it wins. Behavior note: a background-only scene now ends immediately with **0 frames** — a background is not content and does not hold a scene open; pair it with something that defines the scene's length.
