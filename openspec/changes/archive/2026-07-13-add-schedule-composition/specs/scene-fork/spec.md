# scene-fork

## ADDED Requirements

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

#### Scenario: Indefinite background bounded by the scene
- **WHEN** a scene runs `Scene.background(Scene.repeat(bounce, Schedule.forever))` followed by a 120-frame main animation
- **THEN** the bounce animates during all 120 frames and the scene ends at frame 120 with the background interrupted

#### Scenario: Mid-frame interruption is safe
- **WHEN** a background fiber is interrupted while awaiting a frame boundary
- **THEN** the phaser's party accounting stays consistent and subsequent frames advance normally

### Requirement: Scene end sequencing keeps the phaser live
When the scene body completes with forked fibers outstanding, the root party SHALL deregister before joining forks, so quiescence is governed by the forks' own parties and frames keep flowing during the drain.

#### Scenario: No deadlock while draining
- **WHEN** the body ends while a forked 60-frame animation is still running
- **THEN** the remaining 60 frames are produced (no deadlock, no premature `done`) and `done` flips only after the fork completes

#### Scenario: Fork failure propagates
- **WHEN** a forked fiber fails
- **THEN** the scene's exit is a failure carrying that cause

### Requirement: Fork returns a handle
`Scene.fork` and `Scene.background` SHALL return the forked fiber so callers can join or interrupt it manually.

#### Scenario: Manual interruption
- **WHEN** a caller interrupts a fiber returned by `Scene.fork` mid-scene
- **THEN** the party is released and the scene can end without waiting for that fiber
