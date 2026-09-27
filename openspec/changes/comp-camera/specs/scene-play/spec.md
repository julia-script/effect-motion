## ADDED Requirements

### Requirement: A played scene renders through its own camera
Each `Scene.play` evaluation SHALL give the child its own active camera, starting as the resting camera for the child's width. `Scene.camera` and `Scene.setCamera` inside the child SHALL resolve to the child's camera, never the parent's. The child SHALL render through its active camera exactly as it does standalone — camera moves, depth, and parallax included — clipped to its bounds. The frame SHALL carry each comp's resolved camera view alongside its bounds. The parent's camera SHALL continue to affect only the placement of the child's composited plane.

#### Scenario: Child camera move renders like standalone
- **WHEN** a played child pans its camera across content at several depths
- **THEN** the child's region of the movie shows the same image as the child rendered standalone, and the parent's camera stays at rest

#### Scenario: Unmoved child is unchanged
- **WHEN** a played child never touches its camera
- **THEN** its comp renders through the resting camera for its width, as before this change

#### Scenario: Camera swap inside a child
- **WHEN** a played child instantiates a camera and makes it active with `Scene.setCamera`
- **THEN** the child's comp renders through that camera, with width defaults from the child's width, and the parent's view is unaffected

### Requirement: A Hud inside a played scene renders pinned to the child's frame
A `Hud` at the top level of a played scene SHALL be drawn within the child's comp, above the child's world content, through the identity camera for the child's width — unaffected by the child's camera moves.

#### Scenario: Hud in a child while its camera moves
- **WHEN** a played child has a Hud dot and pans its camera
- **THEN** the dot renders at the same place in the child's bounds as it would standalone

### Requirement: A played scene's comp takes depth of field from the parent only
A played child's comp SHALL render sharp: its own camera's `aperture` and `focusDistance` SHALL NOT blur the child's content. The comp's composited plane SHALL take the parent camera's depth of field at the plane's own depth, like any other layer in the parent's world.

#### Scenario: Child opens its lens
- **WHEN** a played child sets its own camera's `aperture` above 0 with content off its focus plane
- **THEN** the comp renders exactly as it does with the child's aperture at 0

#### Scenario: Parent opens its lens
- **WHEN** the parent's camera has `aperture` above 0 and the comp's plane sits off the parent's focus plane
- **THEN** the comp's plane blurs by the parent's circle of confusion at its depth
