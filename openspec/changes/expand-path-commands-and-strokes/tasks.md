# Tasks

## 1. Command and schema support

- [x] 1.1 Expand PathCommand and shared stroke schemas; verify compatible defaults, invalid-data rejection, and scalar tween targets with motion tests/typecheck.
- [x] 1.2 Implement deterministic command flattening including relative/smooth/arc/depth semantics; verify analytic coordinates, degeneracies, and exact endpoints in focused geometry tests.

## 2. Stroke interval geometry

- [x] 2.1 Implement normalized global trim and closure handling; verify known contour distances, wrapped intervals, empty/full selections, and 3D cuts.
- [x] 2.2 Implement dash patterns and offsets composed with trim; verify odd/zero patterns, phase anchoring, subpath boundaries, and closed seams.

## 3. Renderer integration

- [x] 3.1 Wire flattened fills and processed strokes into all five strokable entities and both planar/spatial branches; verify retained-renderer tests for controls, unchanged fill, color-only reuse, and disposal.
- [x] 3.2 Verify caps/joins feasibility and document deferral when unsupported by the current Three path.

## 4. Authoring and integration verification

- [x] 4.1 Document command fields, trim/dash semantics, limitations, and a working animated example; verify example compilation.
- [x] 4.2 Run affected tests, type/build checks, formatting checks, and OpenSpec strict validation; record any environmental limits and inspect rendered output where available.
