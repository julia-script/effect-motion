# Tasks: Add Spring Animation

## 1. Physics module (new src/Physics.ts)

- [x] 1.1 `Spring` interface + validation defects (mass > 0, stiffness ≥ 0, damping ≥ 0), `defaultSpring` ({ mass: 0.05, stiffness: 10, damping: 0.5 }) (design D3)
- [x] 1.2 Preset registry `springs` (beat, plop, bounce, swing, jump, strike, smooth with canonical constants), `SpringName`, `SpringInput`, `resolve` (defect on unknown name)
- [x] 1.3 Export `Physics` from src/index.ts; export Motion's `Target`/target-resolution helpers for reuse (design D6)

## 2. Physics combinators

- [x] 2.1 Spring engine in Physics.ts: per-key position/velocity, Hooke's-law step at fixed 1/120 s substeps consuming 1/frameRate per scene frame, settle check per substep (all keys within tolerance), exact snap onto target, one fn call + Scene.tick per frame (design D1/D2)
- [x] 2.2 `Physics.spring(from, to, springInput, fn, settleTolerance?)` — explicit-origin records + callback (design D4)
- [x] 2.3 `Physics.springTo(instance, to, springInput?, settleTolerance?)` — dual/pipeable via Instance.isInstance, origin from current data, applies via Scene.update, resolves with the instance, defaultSpring when omitted (design D4)

## 3. Tests

- [x] 3.1 test/physics.test.ts: resolve by name/object/unknown-name defect; validation defects for bad mass/stiffness/damping
- [x] 3.2 Physics spring tests (scene-driven): settles exactly on target; bouncy preset overshoots then lands; stiff vs loose springs take different frame counts (no duration); per-key record settles together; springTo both call forms + default spring; custom settleTolerance changes settle frame count
- [x] 3.3 Frame-rate independence: same spring at frameRate 30 vs 60 settles to (approximately) the same trajectory in time terms

## 4. Playground

- [x] 4.1 Add springy motion to the playground scene (e.g. plop-in entrance, a swing across) alongside the easing race

## 5. Verify

- [x] 5.1 `pnpm check`, `pnpm lint`, `pnpm test` green; headless verification of settling/overshoot; playground plays in the browser
