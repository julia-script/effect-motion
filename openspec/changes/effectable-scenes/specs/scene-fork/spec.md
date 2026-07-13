# scene-fork

## MODIFIED Requirements

### Requirement: Fork returns a handle
`Scene.fork` and `Scene.background` SHALL return a branch handle exposing at least the forked fiber and the branch's `finished` latch, so callers can join, await semantic completion, or interrupt it manually.

#### Scenario: Manual interruption
- **WHEN** a caller interrupts the fiber from a handle returned by `Scene.fork` mid-scene
- **THEN** the party is released and the scene can end without waiting for that fiber

#### Scenario: Awaiting semantic completion
- **WHEN** a caller awaits a fork handle's `finished` latch
- **THEN** it proceeds when the fork calls `Scene.finish` or completes, whichever comes first

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
