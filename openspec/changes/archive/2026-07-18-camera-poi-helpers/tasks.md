# Tasks — Camera Point of Interest + Helpers

## 1. POI state + look-at math

- [x] 1.1 Add `poiX`/`poiY`/`poiZ` (`Schema.optionalKey(Schema.Number)`) to the Camera fields in `packages/motion/src/Camera.ts`; Runner does not fill them.
- [x] 1.2 In `packages/motion/src/Projection.ts`, add `lookAtOrientation(position, poi) → {rotX, rotY}` (yaw+pitch, z-flip handedness handled here) and `resolveCamera(data) → CameraView` (auto-orient + additive explicit Euler; partial POI → loud defect; absent POI → pass-through). ponytail comment on additive composition.
- [x] 1.3 Wire `resolveCamera` where the frame camera becomes a `CameraView` (Renderer), leaving `frame.camera` data untouched.
- [x] 1.4 Unit tests: POI-ahead → zero orientation; left/right/above sign checks; dutch angle (`rotZ` composes while aimed); orbit identity; partial-POI defect; POI-absent pass-through (existing camera tests unchanged).

## 2. Motion.drive

- [x] 2.1 Add `drive(instance, duration, timing, fn)` to `packages/motion/src/Motion.ts` as a dual, reusing the frame/tick bookkeeping of the interpolate engine (exact `t = 1` final frame, zero duration = one frame).
- [x] 2.2 Tests: coordinated two-field arc; exact landing; dual forms; zero-duration single frame.

## 3. Target resolution

- [x] 3.1 In `packages/motion/src/Camera.ts`, add `CameraTarget` (`Instance | Effect<Instance> | Position`) and the resolver: type dispatch, Effect resolved once at start, Instance read live via `~position`, offset applied per frame.
- [x] 3.2 Tests: each target kind resolves; offset applied; live-read reflects same-frame movement.

## 4. Helpers

- [x] 4.1 `Camera.lookAt(target, duration?, timing?)`: instant POI set; with duration, retargeted tween on `drive`, with no-POI seeding (start POI = point along current view direction at target distance).
- [x] 4.2 `Camera.follow(target, duration)`: per-frame POI copy on `drive` (linear, hard copy).
- [x] 4.3 `Camera.orbit`/`orbitTo` and `Camera.dolly`/`dollyTo` on `drive`: azimuth/distance relative to POI, radius/height preserved (orbit), view axis preserved (dolly); no-POI → loud defect naming the remedy.
- [x] 4.4 Tests: instant + eased lookAt (moving target lands exactly, no snap on seed); follow tracks per frame; follow-before-target fork order gives deterministic 1-frame trail; pipe chain `follow → lookAt → follow` phases hand off frame-exact; orbit keeps POI centered every frame; orbit/dolly defect without POI; dolly distance + aim preserved.

## 5. Docs & integration

- [x] 5.1 Rewrite `apps/docs/examples/bezier-3d.scene.ts` onto `Camera.lookAt` + `Camera.orbit` (delete the hand-rolled loop); update the page prose; add the follow-ordering practice note where camera docs live (`content/docs/concepts/camera.mdx`).
- [x] 5.2 Record the naming rule (no base/To pair for target-naming verbs) in AGENTS.md, referencing this change.
- [x] 5.3 `pnpm lint:fix && pnpm check && pnpm test` — no NEW failures vs the pre-existing baseline.
