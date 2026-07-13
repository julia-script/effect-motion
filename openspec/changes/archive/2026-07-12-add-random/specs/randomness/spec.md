# Spec: randomness

## ADDED Requirements

### Requirement: Seeded random service provided to scenes
Every scene run SHALL automatically receive a pseudo-random service seeded from the runner settings (`seed`, a number or string, with a fixed documented default) via effect's seeded Random, so all effect Random combinators work in scene code with nothing added to the effect requirements channel.

#### Scenario: Combinators work with zero plumbing
- **WHEN** a scene yields `Random.nextBetween(10, 50)` or `Random.choice([...])` without providing any layer
- **THEN** the values come from the seeded scene service

#### Scenario: Seed comes from settings
- **WHEN** two scenes run with different seeds in their runner settings
- **THEN** their random sequences differ; string and numeric seeds are both accepted

### Requirement: Deterministic by default
The same scene run with the same settings SHALL produce byte-identical frames, including all randomly generated values — with the default seed and with any explicit seed, for a fixed dependency set (sequence stability across effect upgrades is not guaranteed and is documented). Parallel lanes share one sequential stream and remain deterministic across runs.

#### Scenario: Same seed, same frames
- **WHEN** the same random-using scene is streamed twice with identical settings
- **THEN** every frame of both runs is identical

#### Scenario: Parallel lanes are reproducible
- **WHEN** a scene consumes randomness inside concurrent phaser lanes and runs twice
- **THEN** both runs produce identical frames

