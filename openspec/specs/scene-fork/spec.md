# scene-fork Specification

## Purpose
TBD - created by archiving change add-schedule-composition. Update Purpose after archive.
## Requirements
### Requirement: Scene.fork runs concurrently and is awaited at scene end
`Scene.fork(effect)` SHALL register a phaser party synchronously before forking, run `effect` concurrently, and return without waiting. The scene's physical end SHALL wait for all forked fibers to complete.

#### Scenario: Fork-only scene still plays
- **WHEN** a scene body consists solely of `Scene.fork(animation)` and returns
- **THEN** the scene produces the animation's frames and ends when the animation completes

#### Scenario: Overlapping spawns drain naturally
- **WHEN** `Scene.repeat(Scene.fork(particle), Schedule.recurs(10))` spawns overlapping multi-frame particles
- **THEN** repeat is never blocked by a running particle, and the scene ends when the last spawned particle finishes

### Requirement: Scene.background is interrupted at scene body end
`Scene.background(effect)` SHALL run `effect` concurrently as a phaser party and interrupt it when the scene body completes. Background fibers MUST NOT delay scene end.

A background MUST NOT be able to prevent a scene from ending. A scene whose body spawns only backgrounds and then returns SHALL reach its end and stop producing frames, exactly as a scene with an empty body does. Registering a background — including in the window between the party being registered and the background fiber first reaching a frame boundary — SHALL NOT block the frame consumer.

#### Scenario: Indefinite background bounded by the scene
- **WHEN** a scene runs `Scene.background(Scene.repeat(bounce, Schedule.forever))` followed by a 120-frame main animation
- **THEN** the bounce animates during all 120 frames and the scene ends at frame 120 with the background interrupted

#### Scenario: Mid-frame interruption is safe
- **WHEN** a background fiber is interrupted while awaiting a frame boundary
- **THEN** the phaser's party accounting stays consistent and subsequent frames advance normally

#### Scenario: Background-only scene terminates
- **WHEN** a scene body consists solely of `Scene.background(animation)` and returns
- **THEN** the scene ends without hanging, and the consumer observes scene end rather than blocking forever

#### Scenario: Background-only scene is not kept alive by an endless background
- **WHEN** a scene body consists solely of `Scene.background(Scene.repeat(bounce, Schedule.forever))` and returns
- **THEN** the scene ends rather than running until the `maxFrames` cap, because a background is not content and does not define length

#### Scenario: The first frame is never blocked by a pending background
- **WHEN** the frame consumer requests the first frame before the forked scene body has run, and that body's only statement spawns a background
- **THEN** the request resolves — either with a frame or with scene end — and never blocks indefinitely

### Requirement: Scene end sequencing keeps the phaser live
When the scene body completes with forked fibers outstanding, the root party SHALL deregister before joining forks, so quiescence is governed by the forks' own parties and frames keep flowing during the drain. The drain SHALL wait on forks' SEMANTIC ends: a fork that called `Scene.finish` is demoted to a background and does not block the drain.

#### Scenario: No deadlock while draining
- **WHEN** the body ends while a forked 60-frame animation is still running
- **THEN** the remaining 60 frames are produced (no deadlock, no premature `done`) and `done` flips only after the fork completes

#### Scenario: Fork failure propagates
- **WHEN** a forked fiber fails before finishing
- **THEN** the scene's exit is a failure carrying that cause

#### Scenario: Finished forks do not block the drain
- **WHEN** the body ends while the only outstanding fork has called `Scene.finish`
- **THEN** the scene ends immediately and the finished fork's tail is interrupted with the backgrounds

### Requirement: Fork returns a handle
`Scene.fork` and `Scene.background` SHALL return a branch handle exposing at least the forked fiber and the branch's `finished` latch, so callers can join, await semantic completion, or interrupt it manually.

#### Scenario: Manual interruption
- **WHEN** a caller interrupts the fiber from a handle returned by `Scene.fork` mid-scene
- **THEN** the party is released and the scene can end without waiting for that fiber

#### Scenario: Awaiting semantic completion
- **WHEN** a caller awaits a fork handle's `finished` latch
- **THEN** it proceeds when the fork calls `Scene.finish` or completes, whichever comes first

