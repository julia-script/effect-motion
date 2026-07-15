## ADDED Requirements

### Requirement: Pure, sink-agnostic projection module

A projection module SHALL provide pure functions — view/perspective matrix construction, world-point projection returning screen position + view-space depth + scale, and four-corner quad projection — shared by every sink and usable without the Effect runtime. It SHALL contain no wall-clock or RNG access.

#### Scenario: Both sinks share one projection

- **WHEN** the string sink and the DOM sink render the same frame with the same camera
- **THEN** both derive screen positions and depths from the identical projection functions
- **AND** billboard and solid-fill-tilt results are pixel-consistent between sinks.

#### Scenario: Projection is arithmetic-only and deterministic

- **WHEN** the same camera and world point are projected twice
- **THEN** the returned screen coordinates, depth, and scale are bit-for-bit equal.

### Requirement: Billboard projection yields an affine placement

For a camera-facing shape, the module SHALL project its anchor to a screen position and uniform scale expressible as an affine `matrix()`, so the existing primitive is emitted unchanged apart from that transform.

#### Scenario: Nearer billboard is larger

- **WHEN** the same billboard is projected at two depths, one nearer the camera
- **THEN** the nearer projection returns a larger scale
- **AND** both are single affine transforms.

### Requirement: Tilted solid-fill planes project to exact quadrilaterals

For a tilted plane with solid fill, the module SHALL project its four corners so the sink can emit an exact `<polygon>`, perspective-correct (trapezoidal under foreshortening) in both sinks.

#### Scenario: A receding tilted plane is a trapezoid

- **WHEN** a solid Rect is tilted so its far edge recedes from the camera
- **THEN** the four projected corners form a trapezoid whose far edge is shorter than its near edge.

### Requirement: Only rectangular solid planes tilt in the POC

Tilt is scoped to rectangular solid planes (the `Rect` shape): a nonzero orientation projects its four corners to an exact polygon. Shapes without a rectangular extent (Circle, Ellipse, Text, Square-by-`size`) SHALL remain camera-facing billboards even when given an orientation — their tilt is deferred. This scope SHALL be documented so authors know a tilted `Text` renders flat.

#### Scenario: A non-Rect shape ignores orientation for now

- **WHEN** a Circle or Text is given a nonzero rotation
- **THEN** it still renders as a camera-facing billboard (no polygon, no foreshortening)
- **AND** a tilted `Rect` renders as an exact perspective polygon in both sinks.
