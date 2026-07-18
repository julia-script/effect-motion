## ADDED Requirements

### Requirement: Path point geometry
The `Path` entity SHALL define its geometry as `points` — a required, ordered array of vertices `{ x, y, z? }` — plus a `closed` flag (default `false`). Per-point `z` MAY be omitted (a pure-2D author never types it) and an absent depth SHALL render as 0. Points are local to the path's `x/y/z` anchor: the anchor translates the whole path rigidly (the standard `~position` lens), while each vertex projects with its own independent world depth (anchor depth + point depth). `closed` joins the last vertex back to the first for stroking; fill SHALL always paint the implicitly-closed region (SVG semantics). `Path` SHALL NOT carry Euler orientation fields, and SHALL NOT accept an SVG `d` string — converting path-data strings to points is userland preprocessing, done before the scene runs.

#### Scenario: 2D authoring omits z

- **WHEN** a `Path` is instantiated with `points: [{x: 0, y: 0}, {x: 10, y: 10}]`
- **THEN** the instance is valid, no `z` appears in its stored points, and it renders as a plain-2D path under the resting camera

#### Scenario: Per-point depth renders skeletal 3D

- **WHEN** a `Path`'s points carry distinct `z` values
- **THEN** each vertex is projected with its own perspective scale, foreshortening the path per point (the n-point generalization of the Line rail)

#### Scenario: Anchor moves the path rigidly

- **WHEN** a `Path` with anchor `(x, y)` is moved via its `~position` trait
- **THEN** every rendered vertex translates by the same delta and the stored `points` array is unchanged
