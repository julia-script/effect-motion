# scene-play Specification

## Purpose
TBD - created by archiving change effectable-scenes. Update Purpose after archive.
## Requirements
### Requirement: Scene.play runs a scene within a scene
`Scene.play(scene, options?)` SHALL run the given scene as a branch of the current scene — sharing the movie's runner, phaser, frame rate, and frame cap — and return its branch handle. Scenes remain plain values; nesting is explicit through this helper (no Effectable wrapper).

#### Scenario: Sequential nesting
- **WHEN** a parent plays sceneA, awaits its `finished`, then plays sceneB and awaits it
- **THEN** one continuous frame stream contains A's animation followed by B's, from a single runner

#### Scenario: Concurrent nesting
- **WHEN** a parent plays two scenes without awaiting between them
- **THEN** both scenes' animations share frames, and the parent's end awaits both (branch semantics)

### Requirement: Per-evaluation dressing
Each `Scene.play` evaluation SHALL wrap the scene body in a fresh scope, a fresh branch handle, a fresh seeded Random stream, and its mount context. A nested scene's `Scene.finish` targets its own branch, not the parent's; a nested scene's finalizers run at that scene's end.

#### Scenario: Nested finish targets the inner branch
- **WHEN** a played scene calls `Scene.finish`
- **THEN** the played scene's handle opens and the parent scene's does not

### Requirement: Seed stability — nested equals standalone
Playing a scene inside a movie seeded `S` SHALL produce the same animated values, frame for frame from the play point, as running that scene standalone with seed `S`. Evaluations MUST reseed a fresh Random stream (never inherit the parent's stream position). `play({ seed })` overrides the seed for that mount.

#### Scenario: Nested playback matches standalone
- **WHEN** a scene using `Random` is run standalone with seed S, and the same scene is played inside a movie whose seed is S
- **THEN** the sequence of random draws (and thus animated values) is identical in both

#### Scenario: Per-mount seed override
- **WHEN** the same scene is played twice, once with `{ seed: "a" }` and once with `{ seed: "b" }`
- **THEN** the two mounts animate differently, each reproducibly

