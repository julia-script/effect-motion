## Context

`Sync.ts` walked the instance tree folding only ancestor translations into each leaf's `world` position; each builtin placed its own object from `world`. Only Rect read `rotation` (its own, not its ancestors'). `scale` and Group `opacity` were never read.

## Decisions

### D1 — Compose in the walk, place in the renderer

The walk composes, per node, `local = T(position) · R(rotation, "ZYX") · S(scale)` under its parent and hands each leaf a `Transform`:

- `matrix` — exact composed matrix; skeletal shapes map local points through it.
- `quaternion` — composed orientation (parent · own).
- `scale` — per-axis product down the tree. With a non-uniformly scaled parent over a rotated child this drops the shear the exact matrix would carry; `entity-transform` already declares shear inexpressible, and a per-axis product never divides (a `scale` of 0 — the common pop-in start — stays well-defined, where decomposing the matrix would produce NaN).
- `rotated` — whether any rotation (own or ancestor) is non-zero.

Planar builtins place their object from `world`/`quaternion`/`scale` through one helper; size stays on a child mesh, so placement and size never fight. Alternative considered: have Sync place every retained object generically. Rejected because skeletal shapes bake world points into geometry and custom renderers would have their object transform overwritten.

### D2 — Billboard iff nothing rotates

An unrotated planar shape keeps billboarding (the object-depth default); any composed rotation makes it a world-oriented plane, generalizing the old Rect-only rule to every planar shape and to rotations inherited from a Group. Rotation of exactly zero is the camera-facing default. ponytail: under a non-resting camera the switch is discontinuous (a spin starting at 0 snaps off camera-facing); camera-relative in-plane spin is the upgrade path if a scene needs it.

### D3 — Group opacity multiplies into leaf data

The walk carries the product of ancestor opacities and hands each leaf a data copy with `opacity` multiplied in, so every renderer (custom ones included) honors a fading Group without new API. The retained diff keys on the frame's own data reference plus the ancestor opacity and the composed transform (value equality), so unchanged subtrees are still skipped. Overlapping children of a translucent Group each blend individually (no flattened group composite) — use `Scene.play` for a flattened precomp.

### D4 — Animators

`scale`/`scaleTo` and `rotate`/`rotateTo` reuse the partial-Vec3 engine behind `move`/`moveTo` (generalized over the field name). A number is the common case — uniform scale, in-plane (z) spin — and a partial vector names channels. Rotation interpolates per Euler channel in radians, so `rotateTo(2π)` is a full turn and lands exactly.

## Risks

- Scenes that set these fields while they were ignored now render differently — intended.
- Per-leaf allocation of a matrix/quaternion/vector per frame in the hot path; acceptable at current scene sizes.
