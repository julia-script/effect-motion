## Why

A scene nested with `Scene.play` that moved its camera rendered frozen: the child's `Scene.camera` was the ROOT's camera (so a child dolly moved the parent's view instead), and the renderer drew every comp through an identity camera. The dogfood showreel hit it on the first beat that moved the camera, breaking the template's "main.ts plays per-beat precomps" model with no warning. Separately, a `Hud` inside a played scene was never drawn at all — the comp's HUD tier was synced but never rendered into its target.

## What Changes

- Every scene owns its camera. `Scene.play` gives the child a fresh resting camera sized to the child's width; `Scene.camera` / `Scene.setCamera` inside the child resolve to the child's (via a new `Runner.CurrentComp` reference provided per play evaluation). A `Camera` instantiated inside a child gets width defaults from the child's width.
- `Frame.comps[id]` carries the child's resolved active camera view (`Runner.CompFrame = CompConfig & { camera }`); the child's active camera, like the root's, is omitted from the frame's instance map.
- The renderer syncs each comp through `frame.comps[id].camera` instead of the identity view. Bounds and clipping are unchanged (the render target is still the child's size), nested comps compose the same way, and what the parent camera does to the comp plane is unchanged (placement, billboarding, homothety). Outer-camera parallax inside a comp (AE's collapse transformations) stays out of scope.
- The comp's HUD tier composites over its world inside the comp target, through the comp's identity camera — pinned while the child camera moves, as at the root.

## Capabilities

### Modified Capabilities

- `scene-play`: a played scene renders through its own camera; a Hud inside it renders pinned.

## Impact

**`packages/motion`** — `Runner.ts` (per-comp cameras, `CurrentComp`, `CompFrame`, `cameraOf`, `setCamera(instance, compId?)`), `Scene.ts` (`camera`, `setCamera`, `play`, `Frame.comps` type).
**`packages/renderer`** — `Sync.ts` (`syncComp` camera), `Renderer.ts` (`renderCompTargets` HUD pass).

**Behavior** — frames and pixels are unchanged for children that never touch the camera or a Hud (their comp camera is the same resting view as before). A child that moved "the" camera used to move the parent's view; it now moves its own. Scenes that relied on a child steering the parent's camera must move it from the parent.
