## MODIFIED Requirements

### Requirement: Full public-API coverage

Every public capability of the library SHALL have a documented home. At minimum the docs SHALL cover: the scene/frame model (`Scene.make`/`run`/`stream`/`step`, `Settings`); the center-origin, y-up coordinate space; entities and instances (the built-in shapes, `instantiate`, polymorphic `children`, `visible`, `appendChild`/`removeChild`, `update`/`data`); animators (the base/To pair pattern, dual call forms, `tween`/`move`/`fade`, `wait`); physics (`spring`/`springTo` and presets); timing and easing (the named curves and custom functions); composition (`chain`, `all`, `stagger`, `fork`, `background`, `repeat`, `play`, `finish`); the camera (dolly/orbit/lookAt/follow, and depth of field — `aperture`/`focusDistance`, rack focus as a tween, the HUD exemption, and the opaque-only/perspective-only/cost limits — in a guide with live examples); determinism (seed and the frame-exact invariants); extensibility (userland builder functions that return instances, and custom render implementations registered through the renderer's `renderers` option — the entity union itself is closed); the React player (`Player`); export to video; fonts; and images. The particle system SHALL NOT be documented as a public capability while it awaits its rewrite.

#### Scenario: A newly-introduced API is documented

- **WHEN** a visitor looks for the entity-composition APIs (`children`, `visible`, `appendChild`)
- **THEN** each is documented with an explanation and, where illustrative, a live example

#### Scenario: Nested scenes and extensibility are documented

- **WHEN** a visitor looks for how to nest scenes (`Scene.play`) or extend rendering (userland builders, custom render implementations)
- **THEN** each has a documented home explaining it

#### Scenario: Particles are not documented

- **WHEN** a visitor searches the handwritten docs for particle content
- **THEN** no concept, guide, or example page documents the particle system, and no example scene imports it

#### Scenario: Depth of field is documented

- **WHEN** a visitor looks for depth of field
- **THEN** a guide explains `aperture` (world-unit lens radius), `focusDistance` and their defaults, rack focus as a tween, the HUD exemption, and the limits, and embeds a live example
