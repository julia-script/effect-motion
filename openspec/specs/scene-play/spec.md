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

### Requirement: A played scene mounts as a bounded sub-composition
Each `Scene.play` evaluation SHALL create an implicit mount group carrying the child scene's `width`/`height` as its bounds, mounted under the ambient parent (or `options.parent`), and set as the child's ambient current-parent. Default placement SHALL center the child's bounds in the enclosing composition. The child's content SHALL be clipped to its bounds when rendered.

#### Scenario: Child smaller than the root
- **WHEN** a 1920×1080 root plays an 800×600 child with default placement
- **THEN** the child's bounds render centered in the root frame and child content outside 800×600 is not drawn

#### Scenario: Child bigger than the root
- **WHEN** a root plays a child whose bounds exceed the root's
- **THEN** the movie's resolution stays the root's, and only the part of the child inside the root frame is visible

#### Scenario: Deep nesting composes
- **WHEN** a played scene itself plays a grandchild scene
- **THEN** the grandchild's mount group nests under the child's mount group, and both clips and transforms compose

### Requirement: A played scene's background paints within its bounds
A non-transparent child `backgroundColor` SHALL be painted within the child's bounds, beneath the child's content. A transparent child background (the default) SHALL paint nothing, so nested scenes composite over the parent like After Effects precomps.

#### Scenario: Opaque nested background
- **WHEN** a played child scene has a non-transparent backgroundColor
- **THEN** a backing of that color fills exactly the child's bounds beneath its content

#### Scenario: Transparent nested background
- **WHEN** a played child scene keeps the default transparent backgroundColor
- **THEN** the parent's content shows through everywhere the child draws nothing

### Requirement: The play handle exposes the mount group
The branch handle returned by `Scene.play` SHALL expose the mount group, so the parent can transform the whole child scene with the existing group primitives (position and opacity via trait lenses, scale via group transforms). Multiple concurrent `play`s SHALL yield independent groups.

#### Scenario: Parent animates a nested scene as one unit
- **WHEN** the parent applies `moveTo`/`fadeTo`/a scale transform to a play handle's group
- **THEN** every instance of the child scene moves, fades, or scales together, bounds included

#### Scenario: Parallel scenes are independent units
- **WHEN** a root plays the same scene twice side by side
- **THEN** each play's group transforms independently of the other

