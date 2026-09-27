---
"effect-motion": minor
---

Scale and rotation animators, per-precomp cameras, and exact tween endpoints.

**BREAKING (pre-1.0 minor):**

- Shapes draw no outline by default. `Rect`, `Circle`, `Ellipse` and `Path` take an optional `strokeColor` and stroke only when it is set; `Line` keeps its black 1-unit stroke. Tweening an unset `strokeColor` dies naming the field.
- A scene mounted with `Scene.play` has its own camera. `Scene.camera` / `Scene.setCamera` inside it resolve to the child's camera, so a child's camera moves no longer steer the parent's view. Each comp's resolved camera rides on `Frame.comps[id].camera`.
- `Scene.all`, `Scene.chain` and `Scene.stagger` reject a bare Effect (it is iterable and used to run as a one-element list): a compile error, and a loud defect for untyped callers.
- A body that only starts background work yields one resting frame, like an empty body.
- Strokes scale with their shape (the narrower planar `|scale|`), so a shape scaled to zero draws nothing.

Also:

- `Motion.scale` / `scaleTo` and `Motion.rotate` / `rotateTo` (base/To duals) on any shape or Group; a Group carries its subtree.
- Tweens land exactly on target: `Color.mix` returns its endpoints at 0/1, numeric lerps return `to` at t = 1, and `easeInSine` / the Back family hit 0 and 1 exactly.
- `Scene.play` no longer hangs when the child forks at its end.
