# scene-nesting

## ADDED Requirements

### Requirement: A scene is a yieldable Effect
A `Scene` value SHALL be directly usable as an Effect: `yield* scene` inside another scene runs the child scene inline (sequentially) within the parent, sharing the parent's runner, phaser, settings, and seeded Random.

#### Scenario: Inline child scene
- **WHEN** a parent scene body executes `yield* sceneA` followed by `yield* sceneB`
- **THEN** sceneA's animations play to completion, then sceneB's play, all in one frame stream from one runner

#### Scenario: Scenes compose with effect combinators
- **WHEN** a scene value is passed to `Scene.fork` (or any effect combinator)
- **THEN** it behaves as the equivalent effect — no scene-specific overload is required for basic execution

### Requirement: Per-scene services are scoped to each evaluation
Each evaluation of a scene SHALL wrap its body in its own scope, a fresh `SceneHandle`, and its mount context. Nested scenes MUST NOT observe the parent's handle as their own.

#### Scenario: Nested finish targets the inner scene
- **WHEN** a child scene running inside a parent calls `Scene.finish`
- **THEN** the child's `finished` latch opens and the parent's does not

#### Scenario: Child scope closes at child end
- **WHEN** a child scene with scoped resources completes inside a parent
- **THEN** the child's finalizers run at child completion, not at movie end

### Requirement: Scene.run remains the movie entry point
`Scene.run` SHALL provide per-movie dressing exactly once (runner, root phaser party, settings, seed, done flag) and consume the outermost scene as an ordinary Effect. Running a movie whose scenes are nested SHALL NOT apply movie dressing to inner scenes.

#### Scenario: One runner per movie
- **WHEN** a movie scene containing two nested scenes is run
- **THEN** exactly one Runner and one phaser exist, and both nested scenes tick the same frame boundary
