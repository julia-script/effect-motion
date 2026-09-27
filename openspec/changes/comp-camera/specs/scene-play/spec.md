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
