# scene-finish

## ADDED Requirements

### Requirement: Scene.finish signals semantic completion
`Scene.finish` SHALL open the innermost enclosing scene's `finished` latch. It MUST NOT interrupt, end, or otherwise alter the execution of the scene body or its forked/background work.

#### Scenario: Tail keeps playing after finish
- **WHEN** a scene calls `Scene.finish` and then continues animating for 60 more frames
- **THEN** observers of `finished` are released immediately and the 60 tail frames still play

#### Scenario: Finish is idempotent
- **WHEN** `Scene.finish` is called twice, or after the body has completed
- **THEN** the latch stays open and no error occurs

### Requirement: Body completion implies finish
A scene's `finished` latch SHALL open when the body completes (success, failure, or interruption), even if `Scene.finish` was never called.

#### Scenario: Implicit finish
- **WHEN** a scene body returns without calling `Scene.finish`
- **THEN** `finished` opens at body completion

### Requirement: Concurrent scenes expose their handle
Running a scene concurrently (fork-of-scene) SHALL return a handle exposing at least `finished` and the scene's fiber, so a parent can await semantic completion and bound the tail by interruption.

#### Scenario: Crossfade sequencing
- **WHEN** a parent forks sceneA, awaits `a.finished`, starts a fade on A's group and forks sceneB
- **THEN** sceneA's tail frames and sceneB's opening frames are produced concurrently

#### Scenario: Parent-bounded tail
- **WHEN** a parent awaits `a.finished`, sleeps 10 frames, then interrupts A's fiber
- **THEN** sceneA stops producing changes after those 10 frames and the movie continues normally
