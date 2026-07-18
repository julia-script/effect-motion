# Design — Camera Point of Interest + Helpers

## Context

The camera is an ordinary Instance ([Camera.ts](../../../packages/motion/src/Camera.ts)): position, Euler orientation, focal length, DoF fields — all raw numeric fields driven by the existing animators. Directing it at something requires per-frame trig with two footguns proven in practice: the view transform flips z before rotating (in-front is +z), inverting rotation handedness vs. world space (the `rotY = -θ` bug caught while building the bezier-3d example), and camera `x`/`y` are pan-from-viewport-center, not world coordinates. After Effects — the explicit reference model — defaults to a two-node camera (position + point of interest, auto-oriented). This change adopts that.

Decisions locked in exploration: POI as state (Option B) over recipe helpers; `follow(target, duration)` as a plain duration-bounded animator, not an open-ended constraint; retargeted-tween semantics for eased `lookAt` at a moving target; targets are polymorphic (`Instance` / `Effect<Instance>` / plain `Position`) with an optional offset; the no-pair naming rule for target-naming verbs.

## Goals / Non-Goals

**Goals:**

- Optional POI on the camera; when present, auto-orient toward it with explicit Euler composing after; when absent, today's camera unchanged.
- One pure, tested home for the look-at math (the handedness handled exactly once).
- `Motion.drive`: public parametric animator for coordinated multi-field motion.
- Helpers: `lookAt`, `follow`, `orbit`/`orbitTo`, `dolly`/`dollyTo` — thin sugar over POI + drive + tween.
- Deterministic everything; POI-absent scenes render byte-identical.

**Non-Goals:**

- Spherical orbit (elevation) — azimuth turntable only in v1; elevation is an additive follow-up.
- `frameTo`/fit-to-bounds (needs entity bounds), camera-on-Path (`moveAlong`, wants curve commands), a NULL entity as a pure animation target — all noted futures.
- Smoothed/springy `follow` presets — `Physics.spring` on POI fields already expresses lag; a preset can come later if a pattern emerges.

## Decisions

### 1. POI as three flat `optionalKey` numeric fields

`poiX`/`poiY`/`poiZ` (world coordinates), `Schema.optionalKey(Schema.Number)`. Flat numbers — not a nested point — because `Motion.tween`'s `InterpolableKeys` and `Physics.spring` operate on flat numeric fields: tweens and springs on the POI work with zero new machinery (this is what makes `lookAt`-with-duration and springy follow nearly free). Absent = one-node camera, exactly today's behavior; the Runner does NOT fill them (unlike `z`/`focalLength`) — POI is an explicit opt-in per the library's defaults philosophy. All three set or all three absent; a partial POI is a loud defect at the point of use.

### 2. Orientation resolution: derived at view-assembly time, never written back

The user's `rotX`/`rotY`/`rotZ` data fields stay untouched — auto-orient is applied where the frame's `CameraView` is assembled (the Renderer reading `frame.camera`), via a pure helper:

```
Projection.lookAtOrientation(position: Vec3, poi: Vec3) → { rotX, rotY }   // yaw + pitch, no roll
Projection.resolveCamera(data) → CameraView                                // auto-orient ∘ explicit Euler
```

Composition rule: **exact** — the explicit Euler applies in camera-local space, then the aim (`M = Aim · UserEuler`), and the composed rotation is extracted back to the pipeline's fixed `Rz·Ry·Rx` Euler convention. (Implementation note, revising the original additive-v1 plan: additive angles roll about the *world* z-axis, dragging the POI ~27px off-center in the dutch-angle test — the spec's central "rolls about the view axis while remaining aimed" scenario forces exact composition. It's ~25 contained lines; the extracted Euler triple redistributes the roll across axes, so only the composed view — asserted through projection — is meaningful, not individual angle values.)

The handedness subtlety lives only inside `lookAtOrientation`, pinned by tests: POI straight ahead → zero rotation; POI to the right/left/above → known signs; orbit-identity (camera on the θ=0 arc point, POI at pivot → resting view exactly).

### 3. `Motion.drive` — the parametric primitive, public

```
drive(instance, duration, timing, fn: (t: number, data: Data) => Data)   // dual, pipeable
```

Per frame: eased `t`, apply `fn`, `Scene.tick`. Final frame receives exactly `t = 1` (the duration-exactness invariant every timing-based animator shares); zero duration still takes one frame. This generalizes the hand-rolled `Scene.update` + `tick` loop from the bezier-3d example and is the engine under `orbit`. Public because it is the honest extension point for any coordinated multi-field motion (Lissajous, cranes, counters) — keeping it private would just push users back to hand-rolling the loop.

### 4. Target resolution: `Instance | Effect<Instance> | Position`, plus offset

```
type CameraTarget = Instance | Effect<Instance> | Entity.Position
```

- `Instance` → read its `~position` trait **live each frame** (fresh from Runner state).
- `Effect<Instance>` → resolved once at helper start (it yields an Instance), then live-read. This keeps the pipeable authoring style working: `Scene.instantiate(...)` results pipe straight in.
- Plain `Position` (`{x, y, z}`) → inherently fixed; this is also the no-entity escape hatch until/unless a NULL entity exists.
- `offset?: Partial<Entity.Position>` (defaults 0) is added to the resolved target position every frame — "look slightly above their head" without a proxy entity.

Dispatch: `Instance.isInstance`, `Effect.isEffect`, else Position — never arity.

### 5. Helper signatures and the naming rule

```
Camera.lookAt(target, duration?, timing?, offset?)   // no duration: set POI this frame
Camera.follow(target, duration, offset?)             // per-frame POI copy; no timing (it's a hard copy)
Camera.orbitTo(azimuth, duration, timing?)           // absolute azimuth around the POI
Camera.orbit(from, to, duration, timing?)
Camera.dollyTo(distance, duration, timing?)          // absolute distance to the POI along the view axis
Camera.dolly(from, to, duration, timing?)
```

All duals (data-first / pipeable), dispatching on `Instance.isInstance` of the first argument, per AGENTS.

**Naming rule (the recorded AGENTS deviation):** verbs that name their target in the verb phrase (`lookAt`, `follow`) have no base/To pair — the base variant ("ease your gaze from a place you aren't looking") is useless, and the To suffix double-stacks prepositions ("look at… to"). An optional duration selects instant vs eased instead. Helpers that animate a field-like value (`orbit` = azimuth, `dolly` = distance) keep the full base/To pair because the convention's semantics genuinely apply.

### 6. `lookAt` semantics

- **No duration**: set `poiX/Y/Z` to resolved target (+offset) — one `Scene.update`, takes effect this frame.
- **With duration**: **retargeted tween** — each frame `poi = lerp(startPoi, target's current position + offset, ease(t))`. Converges onto a moving target and lands exactly on it at `t = 1`; deterministic (pure function of frame state). A plain-`Position` target degenerates to an ordinary fixed tween — the target *type* selects the semantics, no option flag.
- **POI seeding**: when the camera has no POI yet, the retargeted tween's `startPoi` is the point along the camera's *current* view direction at the resolved target's distance — the re-aim starts from where the camera is actually looking, so engaging POI mode mid-scene never snaps.

### 7. `follow` semantics and frame ordering

Per frame for the duration: resolve target position (+offset), set POI, tick. A plain animator — pipes, `Scene.all`, `stagger`, `repeat` all compose. Ordering: within a tick, concurrent branches execute in fork order (Phaser barrier), so a follow forked *before* its target's animator reads the previous frame's position — a **deterministic** 1-frame trail, not flakiness. Documented as practice ("put the camera last in `Scene.all`"), not enforced.

### 8. `orbit` / `dolly` require a POI

Both are defined relative to the POI (orbit pivots on it; dolly changes distance to it). Calling either with no POI set is a loud defect naming the fix ("set a point of interest first — Camera.lookAt(target)"). Orbit: azimuth measured around the world-Y axis through the POI, θ = 0 directly +z of the POI (so a resting camera aimed at a centered POI sits at θ = 0 — the orbit-identity test); radius = current horizontal distance, preserved through the arc; camera height preserved. Implemented on `drive` (position moves; orientation is free — the POI pins it).

## Risks / Trade-offs

- **[Gimbal singularity in Euler extraction]** A camera pitched straight up/down degenerates yaw/roll. → Standard fallback (roll folded to 0) with a comment; measure-zero configuration for motion-graphics cameras.
- **[Follow's 1-frame trail on mis-ordering]** → Deterministic by construction (fork order is fixed); docs teach the ordering practice; often reads as pleasing lag anyway.
- **[POI + DoF interaction]** `focusDistance` is independent view-space state; auto-orient doesn't move it. A camera aimed at a POI is not automatically *focused* on it. → Out of scope; a `focusOn` helper (or `lookAt` option) is a natural follow-up once wanted.
- **[Effect-target resolution timing]** An `Effect<Instance>` target resolves when the helper starts, not per frame. → Matches animator-subject semantics elsewhere; documented.

## Migration Plan

None breaking: POI fields are optional and Runner-unfilled; existing scenes carry no POI and render byte-identical (regression-tested). The bezier-3d docs example is rewritten onto `lookAt` + `orbit`, deleting the hand-rolled loop it currently teaches.

## Open Questions

None blocking. Elevation for orbit, `focusOn`, springy-follow presets, and the NULL entity are all recorded follow-ups.
