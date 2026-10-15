## MODIFIED Requirements

### Requirement: Path painted from projected subpaths
The renderer SHALL render a `Path` from its world-space subpath polylines (with per-point z) using renderer-owned stroke geometry or coverage masks — no SVG d-string parsing anywhere in the pipeline, no CPU screen projection. `Path` SHALL be part of the exhaustive built-in manifest (the type-level coverage guarantee). Stroke width follows the world-unit stroke semantics; closed subpaths close their polyline. Planar subpaths belonging to one entity SHALL participate in one stroke coverage union; splitting them into rendering segments SHALL NOT multiply stroke opacity. Nonplanar depth paths SHALL retain their per-point-depth rendering behavior.

#### Scenario: Path renders through the built-in manifest
- **WHEN** a frame contains a `Path` and no consumer-provided render implementations
- **THEN** the path renders through the built-in three render path

#### Scenario: Closed subpath closes its geometry
- **WHEN** a Path subpath ends with a `Z` command
- **THEN** the emitted polyline is closed

#### Scenario: Multiple planar subpaths overlap
- **WHEN** two subpaths in the same planar Path intersect and its stroke alpha is 0.5
- **THEN** their fully covered intersection has the same stroke opacity as the fully covered non-overlapping portions


## ADDED Requirements

### Requirement: One opacity application per planar stroke
The renderer SHALL treat the entire stroke of a planar Rect, Circle, Ellipse, Line or Path as one painted region. Segment overlaps, joins, closure seams, retraced portions, self-crossings and overlaps between subpaths of the same Path SHALL contribute coverage to that region without accumulating paint opacity. This SHALL apply to flat content in paint contexts and planar strokes placed or tilted in depth contexts. Independent stroke entities SHALL remain independent painting operations. For this requirement a planar Path or Line has constant local z across its defining points; arbitrary nonplanar 3D paths are outside the guarantee.

#### Scenario: Triangle joins at half opacity
- **WHEN** a closed planar triangle is stroked at alpha 0.5
- **THEN** its fully covered corners and straight sections have the same stroke opacity, with no darker overlap patches

#### Scenario: Closed rectangle seam
- **WHEN** a planar rectangle outline closes at its starting point with fractional stroke alpha
- **THEN** the closure paints once and has no extra opacity compared with the other joins

#### Scenario: Retracing and self-crossing
- **WHEN** a planar Path retraces a segment or crosses itself
- **THEN** the common stroke region retains one application of its stroke opacity

#### Scenario: Separate entities still blend
- **WHEN** two separate fully covered strokes at alpha 0.5 overlap against the same opaque backdrop
- **THEN** they source-over composite as two paints, producing the equivalent of combined alpha 0.75 rather than being merged into one stroke

#### Scenario: Planar stroke in a depth scene
- **WHEN** a planar stroked rectangle is tilted in a depth context
- **THEN** joins still receive one application of stroke opacity and external geometry occludes it according to depth

### Requirement: Coverage remains distinct from paint opacity
The stroke region SHALL preserve fractional edge coverage and apply stroke color alpha and entity opacity once to that coverage. Changing opacity alone SHALL NOT change the silhouette, introduce opaque fringes or alter layering. A zero-opacity stroke SHALL have no visible or occluding effect. Transparent regions outside a stroke SHALL NOT hide other content.

#### Scenario: Fade a joined stroke
- **WHEN** the same joined stroke fades through opacity 0, 0.25, 0.5, 0.75 and 1
- **THEN** its fully covered regions fade uniformly and its antialiased boundary retains partial coverage without seams

#### Scenario: Empty interior in depth
- **WHEN** an unfilled stroked shape sits in front of another object
- **THEN** its interior and the transparent area outside its silhouette leave the other object visible

### Requirement: Fill and stroke are separate paints
The renderer SHALL paint a shape's fill separately from its stroke, with the stroke over the fill. Uniform stroke opacity SHALL NOT require uniform final pixel color where the backdrop differs. The stroke union SHALL preserve the authored stroke width and closure and SHALL NOT introduce endpoint-cap patches at interior joins.

#### Scenario: Translucent border over colored fill
- **WHEN** a centered translucent border straddles a colored fill and a different outer background
- **THEN** the two parts blend with their respective backdrops while joins do not receive additional stroke opacity

### Requirement: Planar stroke union is shared across output adapters
Browser playback and Node export SHALL use the same stroke-union semantics and produce visually equivalent joins and opacity. Repeated frames, changes in stroke width and entity removal SHALL not leave stale mask content or unbounded live resources.

#### Scenario: Resize and remove
- **WHEN** an outlined shape changes size and width, then is removed
- **THEN** its current frame contains only its current stroke coverage and later frames contain no residual stroke pixels
