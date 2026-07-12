# Spec: svg-rendering (delta)

## ADDED Requirements

### Requirement: Hierarchical rendering
Frames SHALL carry a root reference (`{ instances, root }`) and renderers SHALL traverse the instance tree post-order from the root: children render before their container, and each render function receives its instance's rendered children (`children: ReadonlyArray<RenderEntitySuccess>`, empty for leaves). The root group itself SHALL NOT render — its children are the top-level entries handed to the sink. Groups materialize as SVG `<g>` elements carrying the group's translate and opacity, wrapping their rendered children. Traversal SHALL die with a defect naming the offending id when an id is referenced by more than one container (including cycles) or when a referenced id has no instance.

#### Scenario: Group wraps its children
- **WHEN** a group at x=100, y=50 contains a circle at x=10
- **THEN** the output contains a `g` element with translate(100 50) wrapping a circle with cx="10", through both the string and DOM sinks

#### Scenario: Nested groups compose transforms in the target
- **WHEN** a group containing another group containing a shape is rendered
- **THEN** the output nests `g` elements and no absolute coordinates are computed by the library

#### Scenario: Duplicate reference is a defect
- **WHEN** the same instance id appears in two groups' children
- **THEN** rendering dies with a defect naming that id

#### Scenario: Dangling reference is a defect
- **WHEN** a group's children contains an id with no instance
- **THEN** rendering dies with a defect naming that id

## MODIFIED Requirements

### Requirement: Absolute positioning
Frame data positions SHALL be applied as coordinates local to the containing group — the library performs no coordinate transformation between frame data and node props; targets compose group transforms natively (SVG via nested `<g transform>`). Top-level instances (children of the root group, which sits at the origin) are therefore in viewport coordinates, preserving flat-scene behavior.

#### Scenario: No transform applied to top-level instances
- **WHEN** a top-level entity's data has x=100, y=100 and its renderer maps them to cx/cy
- **THEN** the materialized element has cx="100" cy="100" regardless of viewport size

#### Scenario: Child coordinates stay local
- **WHEN** a shape at x=10 sits inside a group at x=100
- **THEN** the shape's element keeps cx="10"; its on-screen position comes from the group's transform
