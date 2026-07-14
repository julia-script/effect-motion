## MODIFIED Requirements

### Requirement: Live examples embed the Player

The docs SHALL embed live examples — a scene running in the `@effect-motion/react` Player (client-side; the scene collects and plays in the browser) alongside the example's source code — within the concept and example pages they illustrate, rather than only in a standalone gallery. Examples SHALL be embedded via a component that takes an example name and renders both the played scene and its source. A single page MAY embed multiple examples.

#### Scenario: Example plays in a concept page

- **WHEN** a visitor opens a concept page that embeds an example
- **THEN** the scene renders in the Player with working transport controls (play/pause, progress bar), inline with the surrounding prose

#### Scenario: Example source is displayed

- **WHEN** a visitor views a page embedding an example
- **THEN** the scene's source code is shown with syntax highlighting

#### Scenario: A page embeds several examples

- **WHEN** a concept page illustrates multiple behaviors (e.g. a composition page showing chain, stagger, and fork)
- **THEN** each is embedded as its own live example on the same page

## ADDED Requirements

### Requirement: Concept-spine navigation

The docs SHALL be organized as a concept spine, not a flat example gallery. The navigation SHALL include an Introduction and a Getting Started page, a **Core Concepts** section, and a **Going Further** section, so a newcomer can progress from mental model to first scene to individual concepts in a coherent order.

#### Scenario: Core Concepts section exists

- **WHEN** a visitor opens the docs navigation
- **THEN** a Core Concepts section groups the foundational topics (scenes/frame model, entities/instances, animators, physics, timing, composition, determinism)

#### Scenario: Going Further section exists

- **WHEN** a visitor opens the docs navigation
- **THEN** a Going Further section groups the advanced/consumer topics (custom entities, rendering & sinks, React player, export, fonts)

### Requirement: Full public-API coverage

Every public capability of the library SHALL have a documented home. At minimum the docs SHALL cover: the scene/frame model (`Scene.make`/`run`/`stream`/`step`, `Settings`); entities and instances (the built-in shapes, `instantiate`, polymorphic `children`, `$visible`, `appendChild`/`removeChild`, `update`/`data`); animators (the base/To pair pattern, dual call forms, `tween`/`move`/`fade`, `wait`); physics (`spring`/`springTo` and presets); timing and easing (the named curves and custom functions); composition (`chain`, `all`, `stagger`, `fork`, `background`, `repeat`, `play`, `finish`); determinism (seed and the frame-exact invariants); extensibility (`Entity.make` with a custom render function, and the SVG sinks); the React player (`usePlayer`/`Player`); export to video; and fonts.

#### Scenario: A newly-introduced API is documented

- **WHEN** a visitor looks for the entity-composition APIs introduced by the entity-tree refactor (`children`, `$visible`, `appendChild`)
- **THEN** each is documented with an explanation and, where illustrative, a live example

#### Scenario: Nested scenes and extensibility are documented

- **WHEN** a visitor looks for how to nest scenes (`Scene.play`) or define a custom entity (`Entity.make` + a render function)
- **THEN** each has a dedicated concept page explaining it

### Requirement: Documentation is accurate to the current API

Documentation content SHALL reflect the current public API. It SHALL NOT describe removed or changed behavior — in particular, `Text` is documented as a plain-string leaf (not a rich-text tree), scene structure as children-defined (not via a per-instance `parent` argument), and video export as using the bundled ffmpeg by default.

#### Scenario: No stale rich-text content

- **WHEN** a visitor reads the text documentation
- **THEN** it describes plain-string `Text` and composition via `children`, with no reference to the removed rich-text tree, `strong`/`emphasis` nodes, or `Motion.reveal`

#### Scenario: Export docs reflect the bundled binary

- **WHEN** a visitor reads the export documentation
- **THEN** it states that video encoding uses the bundled ffmpeg by default, with a `binary` override for a system ffmpeg
