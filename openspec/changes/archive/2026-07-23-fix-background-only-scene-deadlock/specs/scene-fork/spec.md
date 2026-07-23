## MODIFIED Requirements

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
