# scene-all Specification

## Purpose
TBD - created by archiving change add-schedule-composition. Update Purpose after archive.
## Requirements
### Requirement: Scene.all is the public lockstep-parallel combinator
`Scene.all(effects)` SHALL behave identically to `Phaser.all`: run all effects in parallel sharing frame phases, resolving when all complete. It SHALL NOT accept a schedule — schedule-paced list composition belongs to `scene-chain` (sequential) and `scene-stagger` (overlapping starts). `Phaser.all` remains available as the low-level API.

#### Scenario: Plain parallel
- **WHEN** `Scene.all([a, b, c])` runs
- **THEN** a, b, and c animate concurrently, sharing frames, and `Scene.all` resolves when the last one finishes

