# motion-renderer (delta)

## MODIFIED Requirements

### Requirement: Frame pipeline preserved
The renderer SHALL flatten a frame's instance tree into a draw-list, compose ancestor world translations, project each paintable through its effective camera — the frame's camera for world content, the identity camera for `Shapes.Hud` subtrees (see the hud-layer capability) — and paint in two tiers: world content in depth-sorted order (farthest first) with a stable id tie-break, then HUD content depth-sorted with the same tie-break. Hidden instances (`$visible === false`) and their subtrees SHALL be skipped. A duplicate parent / cycle SHALL be a loud defect naming the instance. An unknown or missing instance id SHALL be a loud defect.

#### Scenario: Depth-sorted deterministic order
- **WHEN** multiple paintables project to the same depth
- **THEN** they are painted in ascending instance-id order, identically across runs

#### Scenario: HUD tier paints after the world tier
- **WHEN** a frame contains both world and Hud content
- **THEN** every world paintable is painted before any HUD paintable

#### Scenario: Hidden subtree skipped
- **WHEN** an instance has `$visible === false`
- **THEN** neither it nor its descendants are painted

#### Scenario: Cycle is a defect
- **WHEN** an instance is referenced by more than one parent, or a cycle exists
- **THEN** the renderer dies with a defect naming the offending instance id
