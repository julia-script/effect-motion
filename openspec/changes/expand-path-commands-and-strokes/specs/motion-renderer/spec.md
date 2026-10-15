# Spec Delta

## MODIFIED Requirements

### Requirement: Path painted from projected subpaths

The renderer SHALL render a Path from local subpath polylines retaining per-point depth, using renderer-owned stroke geometry or coverage masks, without SVG string parsing or CPU screen projection. The full typed command vocabulary SHALL resolve to deterministic geometry with exact authored endpoints and bounded curve approximation. Path SHALL remain in the exhaustive built-in manifest. Stroke widths SHALL remain world-unit dimensions. Closed subpaths SHALL close their polylines. Planar subpaths of one entity SHALL participate in one coverage union without multiplying opacity at overlaps. Nonplanar paths SHALL preserve per-point-depth rendering.

#### Scenario: Path renders through the built-in manifest
- **WHEN** a frame contains a Path
- **THEN** it renders through the built-in renderer without consumer registration

#### Scenario: Closed subpath closes its geometry
- **WHEN** a subpath ends in Z or z
- **THEN** its untrimmed polyline closes

#### Scenario: Multiple planar subpaths overlap
- **WHEN** subpaths intersect with stroke alpha 0.5
- **THEN** their fully covered intersection has the same stroke opacity as non-overlapping portions

#### Scenario: Curves preserve authored endpoints
- **WHEN** a cubic, quadratic, or arc command is rendered
- **THEN** its approximation ends exactly at the authored endpoint and yields the same geometry for the same input

## ADDED Requirements

### Requirement: Trimmed and dashed stroke rendering

The renderer SHALL apply trim/dash selection to strokes of Line, Path, Rect, Circle, and Ellipse without changing fills. Cuts SHALL interpolate depth and SHALL NOT bridge subpaths, trim gaps, or dash gaps. Fully retained closed contours SHALL remain closed, and continuous coverage through a closure seam SHALL remain joined. All fragments of one planar entity SHALL share its stroke coverage union. Browser and Node SHALL share these semantics. Color/opacity-only updates SHALL reuse stroke geometry, and changed controls SHALL update retained geometry without stale content or leaked resources.

#### Scenario: Depth at a cut
- **WHEN** trimming cuts halfway along a 3D line
- **THEN** its cut endpoint has the interpolated x/y/z values

#### Scenario: Fill survives trimming
- **WHEN** a filled closed path has an empty stroke trim
- **THEN** its fill remains intact and the stroke paints nothing

#### Scenario: Controls update without command edits
- **WHEN** trim or dash offset changes while the command array stays the same
- **THEN** rendered stroke geometry changes and fill geometry is retained

#### Scenario: Color update retains geometry
- **WHEN** only stroke color or opacity changes
- **THEN** curve tessellation and stroke geometry are reused
