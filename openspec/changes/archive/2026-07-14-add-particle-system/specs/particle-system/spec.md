## ADDED Requirements

### Requirement: ParticleField is a single instance backing many particles

The system SHALL provide a `ParticleField` entity that is instantiated as a single `Instance` — one node in the entity tree, advanced by a single fiber — whose data holds a buffer of many particles. The cost the field imposes on the frame barrier SHALL be independent of the number of live particles.

#### Scenario: One party on the barrier regardless of count

- **WHEN** a `ParticleField` with any number of live particles is simulated
- **THEN** the field registers exactly one party on the phaser per frame, and advancing one frame produces exactly one phaser arrival for the whole field

#### Scenario: The field is one tree node

- **WHEN** a `ParticleField` is instantiated under a parent group
- **THEN** the field appears as a single child of that group, and its particles are not individually present in the entity tree

### Requirement: Author behavior as distributions sampled at birth

The system SHALL let an author configure per-particle properties (including at least speed, launch angle, lifetime, and size) as uniform ranges `[min, max]`. For each particle, the system SHALL draw one sample per ranged property at birth. Shared forces (e.g. gravity) SHALL be authored as plain values, not ranges.

#### Scenario: Ranged property yields varied particles

- **WHEN** a field is configured with `speed: [80, 140]` and emits multiple particles
- **THEN** each particle is assigned a speed within `[80, 140]`, and particles generally differ from one another

#### Scenario: A fixed value applies uniformly

- **WHEN** a field is configured with a shared `gravity` value
- **THEN** every particle is integrated under that same gravity

### Requirement: Over-life curves evolve a particle deterministically by age

The system SHALL support over-life curves for at least `size` and `opacity`, where the property's value is a deterministic function of the particle's own age (0 at birth to 1 at end of life), expressed with the easing vocabulary in `Timing.ts`. Over-life evolution SHALL introduce no randomness after birth.

#### Scenario: Size shrinks over life

- **WHEN** a particle is configured with an over-life size curve from 5 to 0 and is at the end of its life
- **THEN** its rendered size is 0, and at birth its size is 5, interpolated by the given easing in between

#### Scenario: Over-life value depends only on age

- **WHEN** two particles of the same field reach the same age
- **THEN** their over-life-curved properties have the same value, regardless of when each was born

### Requirement: Emission supports both burst and stream

The system SHALL support one-shot **burst** emission (a `count` of particles born on a single frame) and continuous **stream** emission (a `rate` of particles per second born over time). Both SHALL write into the same buffer and share identical integration and lifecycle behavior downstream.

#### Scenario: Burst births all at once

- **WHEN** a field emits a burst of `count: 500` on frame F
- **THEN** 500 particles are born on frame F and no further particles are born by that burst afterward

#### Scenario: Stream births over time

- **WHEN** a field emits a stream of `rate: 60` particles per second at 60 fps
- **THEN** approximately one particle is born per frame while the stream is active

### Requirement: Fill emission spreads a floating field evenly

The system SHALL support a `fill` emission that seeds a count of particles spread EVENLY across a region (defaulting to the whole frame) on the first frame, rather than from a source point. Fill particles SHALL be given a small random drift velocity, SHALL NOT age out, and SHALL wrap around the region's edges so the field stays populated indefinitely with no lifecycle churn.

#### Scenario: Fill scatters across the region, not at a point

- **WHEN** a field emits `fill: 140` over a 500×300 frame
- **THEN** the 140 particles are distributed across the full width and height, not clustered at the field origin

#### Scenario: Fill particles persist and wrap

- **WHEN** a fill field is simulated for many frames with no further emission
- **THEN** no fill particle dies, the live count holds constant, and every particle stays within the region by wrapping at its edges

### Requirement: Typed constructors gate props and emission by field kind

The system SHALL provide two constructors — an emitter (source) and a floating field — that accept only the properties meaningful to that kind, and SHALL constrain the `simulate` emission to match: an emitter accepts `{ burst }` or `{ rate }`, a floating field accepts `{ fill }`. A mismatched emission SHALL be a compile-time type error. Both SHALL produce an ordinary `ParticleField` instance (the brand is compile-time only).

#### Scenario: Emitter rejects fill at compile time

- **WHEN** an author calls `simulate` on an emitter-constructed field with `{ fill: n }`
- **THEN** it is a TypeScript type error

#### Scenario: Floating field rejects burst at compile time

- **WHEN** an author calls `simulate` on a field-constructed field with `{ burst: n }`
- **THEN** it is a TypeScript type error

### Requirement: Per-particle opacity is randomizable

The system SHALL support an `opacityRange` `[min, max]` drawn per particle at birth (0..1), independent of the field's own opacity trait. When an over-life opacity curve is also set, the rendered opacity SHALL be the drawn baseline multiplied by the curve's value at the particle's age. Omitting `opacityRange` SHALL leave every particle fully opaque and SHALL NOT consume a random draw.

#### Scenario: Opacity is drawn within range

- **WHEN** a field is configured with `opacityRange: [0.2, 0.8]` and emits particles
- **THEN** each particle's baseline opacity lies within `[0.2, 0.8]`, and particles generally differ

#### Scenario: Baseline multiplies the over-life curve

- **WHEN** a particle with baseline opacity 0.4 is at an age where its opacity-over-life curve evaluates to 0.5
- **THEN** its rendered opacity is 0.2

### Requirement: The field is deterministic under the seeded Random service

Given the same seed, a `ParticleField` SHALL produce byte-identical output across runs. The system SHALL seed each particle's own independent PRNG from the runner's seeded `Random` service at birth; all per-particle evolution after birth SHALL be pure. The system SHALL NOT use `Math.random` or any wall-clock source. The order in which per-particle properties are drawn at birth SHALL be fixed and documented, and a change to that order is a breaking change.

#### Scenario: Same seed reproduces the field

- **WHEN** the same scene containing a `ParticleField` is run twice with the same seed
- **THEN** the two frame lists are byte-identical

#### Scenario: A particle's randomness is independent

- **WHEN** particles are born
- **THEN** each carries its own PRNG state seeded from the runner, such that consuming one particle's randomness cannot shift another particle's drawn values

### Requirement: Fixed-capacity buffer overwrites the oldest on overflow

A `ParticleField` SHALL have a fixed particle capacity set at instantiation. When emission would exceed the number of free slots, the system SHALL overwrite the oldest live particles rather than growing the buffer or dropping newly emitted particles.

#### Scenario: Overflow overwrites oldest

- **WHEN** a full field of capacity C emits new particles
- **THEN** the oldest live particles are replaced by the new ones and the total live count never exceeds C

### Requirement: A simulate animator advances the field one frame at a time

The system SHALL provide a `simulate(duration)` animator that advances a `ParticleField` for the given duration, running the field's per-frame step (emit, integrate, kill expired) exactly once per frame and arriving at the phaser exactly once per frame. It SHALL follow the library's animator conventions: a base/`To` shape where applicable, dual data-first and pipeable call forms, and dispatch by `Instance.isInstance` on the first argument.

#### Scenario: One step per frame

- **WHEN** `simulate("1 second")` runs on a field at 60 fps
- **THEN** the field's per-frame step runs 60 times and the animator arrives at the phaser 60 times

#### Scenario: Dual call forms

- **WHEN** the animator is invoked as `simulate(field, duration)` and as `field.pipe(simulate(duration))`
- **THEN** both forms advance the field identically

#### Scenario: Expired particles are removed

- **WHEN** a particle's age reaches its drawn lifetime during simulation
- **THEN** the particle is no longer live and is not rendered on subsequent frames
