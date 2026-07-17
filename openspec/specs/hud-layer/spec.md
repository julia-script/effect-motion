# hud-layer Specification

## Purpose
Screen-space HUD content: a `Shapes.Hud` container whose subtree projects through the identity camera — camera-independent, always painted on top of world content, and structurally exempt from depth of field.

## Requirements

### Requirement: Hud container projects its subtree through the identity camera
`effect-motion` SHALL provide a `Shapes.Hud` container whose descendants are projected through the identity camera for the frame's width instead of the active camera. Moving, rotating, zooming, or shaking the active camera SHALL NOT change where HUD content renders.

#### Scenario: HUD ignores camera movement
- **WHEN** a scene renders a Hud child and a world shape, then the camera dollies and rotates
- **THEN** the world shape's rendered position changes and the Hud child's does not

#### Scenario: In-HUD placement matches plain-2D
- **WHEN** a Hud child sits at (x, y) with z 0
- **THEN** it renders at screen (x, y) at scale 1, wherever the active camera is

### Requirement: HUD paints on top
HUD paintables SHALL paint after all world paintables regardless of depth values: the paint order is world content by depth (farthest first, stable id tie-break), then HUD content by depth (same tie-break). Multiple Hud containers share the top tier.

#### Scenario: HUD beats near world content
- **WHEN** a world shape sits very near the camera, overlapping a Hud child on screen
- **THEN** the Hud child paints over it

#### Scenario: Deterministic order within the HUD tier
- **WHEN** two Hud children project to the same depth
- **THEN** they paint in ascending instance-id order, identically across runs

### Requirement: HUD is exempt from depth of field
With any active-camera `aperture`, HUD content SHALL render sharp: its effective camera is the identity camera (aperture 0), so its blur is structurally zero through the same circle-of-confusion path as world content.

#### Scenario: Sharp HUD over a blurred world
- **WHEN** the active camera has `aperture > 0` and world content off the focus plane blurs
- **THEN** HUD content renders pixel-sharp

### Requirement: Hud offset is screen-space and animatable
Like Group, a Hud SHALL contribute its `x`/`y` to its children — in screen coordinates. The container SHALL carry no `z`. Animating the container's position SHALL move its whole subtree.

#### Scenario: Sliding a lower-third in
- **WHEN** a Hud containing several children tweens from off-screen x to 0
- **THEN** all children move together in screen coordinates

### Requirement: Placement rules
A Hud inside world content — any ancestor container outside a Hud subtree, other than the root — SHALL be a loud defect naming the instance (world offsets composing into screen coordinates is incoherent). Inside a Hud subtree, a nested Hud SHALL be allowed and behave as a plain Group (everything there is already identity-projected).

#### Scenario: World-nested Hud is a defect
- **WHEN** a Hud is a child of an ordinary Group
- **THEN** rendering dies with a defect naming the Hud instance and the top-level rule

#### Scenario: Hud in Hud composes offsets harmlessly
- **WHEN** a Hud contains another Hud with an offset
- **THEN** the inner subtree renders with both offsets composed, identity-projected

### Requirement: Sub-scenes mount into the HUD with the existing API
A scene SHALL be mountable under a Hud via the existing parented playback (`Scene.play(scene, { parent: hud })`), with no HUD-specific mount API.

#### Scenario: A lower-third scene mounts into the HUD
- **WHEN** a self-contained scene is played with a Hud as its parent
- **THEN** its instances render as HUD content (identity-projected, top tier)
