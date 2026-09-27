## 1. Motion

- [x] 1.1 `Runner.CurrentComp` reference; per-comp default camera at `registerComp`; `cameraOf` / `setCamera(instance, compId?)`
- [x] 1.2 `Frame.comps[id].camera` (`Runner.CompFrame`); active child cameras omitted from instances
- [x] 1.3 Cameras instantiated in a child get the child's width defaults
- [x] 1.4 `Scene.play` provides `CurrentComp`; `Scene.camera` / `setCamera` resolve per scene

## 2. Renderer

- [x] 2.1 `syncComp` renders through `frame.comps[id].camera`; CompState docs + ponytail updated
- [x] 2.2 `renderCompTargets` composites the comp's HUD tier into its target

## 3. Tests

- [x] 3.1 motion: child camera moves land on the comp, root camera stays at rest; unmoved child carries the resting view; setCamera + width defaults in a child equal standalone
- [x] 3.2 renderer (Dawn): a child that pans its camera renders like standalone; an unmoved child unchanged; a Hud in a child stays pinned
