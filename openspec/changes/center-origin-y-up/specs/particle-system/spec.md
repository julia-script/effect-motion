# particle-system Specification (delta)

## ADDED Requirements

### Requirement: Direction semantics in the scene frame
Positive `gravity` SHALL accelerate particles toward the bottom of the screen (−y in scene space), keeping the plain-language meaning of the word. Launch `angle: 0` SHALL mean straight up (+y), with positive angles counterclockwise (the scene rotation convention, see `coordinate-system`). Changing only the interpretation of drawn values SHALL NOT alter the per-particle RNG draw sequence, so a given seed keeps producing the same underlying random stream.

#### Scenario: Fountain falls back down
- **WHEN** a fountain field emits with positive speed, `angle: [0, 0]`, and positive `gravity`
- **THEN** particles launch toward the top of the frame, decelerate, and fall back toward the bottom

#### Scenario: Symmetric angle range is direction-agnostic
- **WHEN** a fountain uses `angle: [-15, 15]`
- **THEN** the spray is symmetric about straight-up regardless of the positive-angle direction convention
