# camera-helpers Specification

## ADDED Requirements

### Requirement: Polymorphic camera targets with offset

Every camera helper that takes a target SHALL accept an `Instance`, an `Effect` resolving to an Instance, or a plain `Position` object, dispatched by type (`Instance.isInstance` / `Effect.isEffect` / otherwise Position), never by arity. An `Instance` target SHALL be read live (its `~position` trait, fresh from runner state each frame); an `Effect` target SHALL be resolved once at helper start and then read live; a plain `Position` is fixed. An optional `offset` (partial position, defaults 0 per axis) SHALL be added to the resolved target position every frame.

#### Scenario: Instance target is read live

- **WHEN** `Camera.follow(hero, "3 seconds")` runs while `hero` moves
- **THEN** each frame's POI equals `hero`'s position that frame (plus offset)

#### Scenario: Plain position target

- **WHEN** a helper is given `{ x, y, z }` instead of an instance
- **THEN** it behaves as a fixed target with no entity involved

#### Scenario: Offset shifts the aim

- **WHEN** `Camera.lookAt(hero, { y: -40 })`-style offset is provided
- **THEN** the POI lands at the target position plus the offset each frame

### Requirement: lookAt

`Camera.lookAt(target, duration?, timing?)` SHALL, with no duration, set the camera's POI to the resolved target this frame. With a duration, it SHALL run a retargeted tween: each frame the POI is the interpolation, at the eased parameter, between the starting POI and the target's *current* position (plus offset), converging exactly onto the target at `t = 1` — deterministic, and equivalent to a fixed tween when the target is a plain Position. When the camera has no POI yet, the starting POI SHALL be seeded as the point along the camera's current view direction at the resolved target's distance, so engaging POI mode never snaps the view. Per the recorded naming rule, `lookAt` has no base/To pair — the optional duration selects instant vs eased.

#### Scenario: Instant aim

- **WHEN** `Camera.lookAt(target)` runs with no duration
- **THEN** the POI equals the target position from this frame on

#### Scenario: Eased re-aim converges on a moving target

- **WHEN** `Camera.lookAt(hero, "1 second")` runs while `hero` moves
- **THEN** the POI lands exactly on `hero`'s position on the final frame, with no terminal snap

#### Scenario: No-POI seeding avoids a snap

- **WHEN** an eased `lookAt` starts on a camera that never had a POI
- **THEN** the first frame's derived orientation equals the camera's prior orientation (the aim starts from where the camera was already looking)

### Requirement: follow

`Camera.follow(target, duration)` SHALL copy the resolved target position (plus offset) into the camera's POI every frame for the duration — a plain duration-bounded animator composing in pipes, `Scene.all`, `stagger`, and `repeat` like any other. It SHALL take no timing input (it is a hard per-frame copy; lag is expressed by springing the POI instead). Within a tick, branch execution order is fork order, so a follow forked before its target's animator SHALL read the previous frame's position — a deterministic one-frame trail, documented as an ordering practice, never nondeterminism.

#### Scenario: Sequential composition

- **WHEN** a scene runs `cam.pipe(Camera.follow(a, "3 seconds"), Camera.lookAt(b, "1 second"), Camera.follow(b, "3 seconds"))`
- **THEN** the camera tracks `a`, re-aims to `b` over one second landing exactly on it, then tracks `b` — each phase starting the frame the previous ends

#### Scenario: Mis-ordered follow is deterministic

- **WHEN** a follow is forked before its target's animator in `Scene.all`
- **THEN** every run and every render produces the identical one-frame-trailing output

### Requirement: orbit and dolly around the point of interest

`Camera.orbitTo(azimuth, duration, timing?)` / `Camera.orbit(from, to, duration, timing?)` SHALL move the camera position along the horizontal circle around the POI (world-Y axis through it, radius = current horizontal distance, height preserved), with azimuth 0 directly +z of the POI so a resting camera aimed at a centered POI sits at azimuth 0. `Camera.dollyTo(distance, ...)` / `Camera.dolly(from, to, ...)` SHALL move the camera along its view axis to the given distance from the POI. Both keep the base/To pair (they animate a field-like value). Orientation during both SHALL come entirely from the POI — no helper writes Euler fields. Invoking either with no POI set SHALL be a loud defect naming the remedy.

#### Scenario: Turntable orbit

- **WHEN** `Camera.orbitTo(Math.PI / 4, "2 seconds")` runs on a camera with a POI
- **THEN** the camera position travels the arc while the POI stays centered in view every frame

#### Scenario: Orbit without POI is a defect

- **WHEN** `orbit` or `dolly` is invoked on a camera with no POI
- **THEN** the scene dies loudly telling the author to set a point of interest first

#### Scenario: Dolly changes distance, not aim

- **WHEN** `Camera.dollyTo(400, "1 second")` completes
- **THEN** the camera sits 400 units from the POI along the same view direction, still aimed at it
