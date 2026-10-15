# Spec Delta

## MODIFIED Requirements

### Requirement: Path command geometry

The Path entity SHALL carry position and a non-empty array of typed commands supporting M/L/H/V/C/S/Q/T/A/Z and their lowercase relative forms. Uppercase coordinates SHALL be offsets from position; lowercase coordinates SHALL be relative to the current point. The first command MUST be M or m; invalid commands and nonfinite coordinates SHALL fail loudly at instantiation. Moving position SHALL move the path rigidly without changing commands.

Endpoint and control points SHALL support optional depth: omitted absolute depth is zero and omitted relative depth is a zero delta. H/V SHALL preserve untouched coordinates. Smooth curves SHALL reflect the preceding compatible control point, including depth, and otherwise use the current point. Close SHALL return the current point to the subpath start. Elliptical arcs SHALL use SVG endpoint parameters in local XY with linear endpoint depth interpolation, absolute radii, radius correction, line fallback for zero radii, and no segment for coincident XY endpoints. Arc rotation SHALL use degrees, and positive sweep SHALL follow positive parametric angles in the scene's y-up coordinates.

#### Scenario: First command must be a move
- **WHEN** a Path starts with a drawing or close command
- **THEN** instantiation fails loudly naming invalid input

#### Scenario: Anchor moves, commands untouched
- **WHEN** position changes
- **THEN** the entire path translates without rewriting its commands

#### Scenario: Flat path preserves plain-2D output
- **WHEN** M/L/Z commands omit depth under the resting camera
- **THEN** their existing plain-2D geometry is preserved

#### Scenario: Per-point depth
- **WHEN** endpoint or control depth is nonzero
- **THEN** the geometry retains depth for perspective rendering

#### Scenario: Relative and smooth commands
- **WHEN** relative curves and smooth continuation commands follow an absolute move
- **THEN** their endpoints and reflected controls resolve from the correct current point

#### Scenario: Arc degeneracies
- **WHEN** arc radii are zero, negative, or too small to connect endpoints
- **THEN** the path respectively uses a line, absolute radii, or expanded radii without nonfinite output

## ADDED Requirements

### Requirement: Portable stroke trim and dashes

Line, Path, Rect, Circle, and Ellipse SHALL expose trimStart=0, trimEnd=1, trimOffset=0, strokeDasharray=[], and strokeDashoffset=0 as ordinary schema data. Scalar fields SHALL be finite and animatable with raw tweens; dash entries SHALL be finite and nonnegative. Invalid values SHALL fail loudly. Defaults SHALL preserve a complete solid stroke.

Trim SHALL select the interval between clamped normalized start/end values over total local 3D contour length, excluding move gaps and including closing segments. End<=start SHALL paint no stroke. Offset SHALL shift the interval cyclically in turns; a full interval SHALL remain full. Trim SHALL leave fill geometry unchanged.

Dashes SHALL alternate painted/gap lengths in local units, repeat odd patterns twice, treat empty/all-zero patterns as solid, and normalize signed offsets modulo pattern length. Phase SHALL restart at each original subpath and remain anchored there as trim changes. Zero painted entries SHALL support dots using the existing round caps; processing SHALL terminate for zero entries.

#### Scenario: Stroke reveal
- **WHEN** trimEnd is tweened from zero to one
- **THEN** the stroke reveals by contour distance and lands on the full stroke while fill stays unchanged

#### Scenario: Wrapped selection
- **WHEN** trimStart=0, trimEnd=0.25, and trimOffset=0.9
- **THEN** the stroke covers normalized distances [0.9,1] and [0,0.15] without joining unrelated subpaths

#### Scenario: Dashes and trim compose
- **WHEN** a dashed path's trim start advances
- **THEN** retained dashes stay at their original contour positions instead of restarting at the trim boundary

#### Scenario: Invalid dash data
- **WHEN** a dash entry is negative or nonfinite
- **THEN** instantiation fails loudly instead of hanging during rendering
