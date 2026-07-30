# docs-site delta: rewrite structure, prose, and examples

## REMOVED Requirements

### Requirement: Concept-spine navigation

**Reason**: The unordered Core Concepts / Going Further split never sequenced the material for learning; it is replaced by a sequenced learning path (see ADDED: Learning-path navigation).
**Migration**: Content homes move as follows — Core Concepts pages become ordered Learn pages; Going Further pages become task-named Guides; the particles pages are deleted outright.

## ADDED Requirements

### Requirement: Learning-path navigation

The docs SHALL be organized as: **Getting Started** (install → first scene → playback → exporting), a **Learn** section, a **Guides** section, an **Examples** section, and the generated **API** reference. The Learn section SHALL be a deliberately sequenced path — one core primitive per page, ordered so each page builds only on earlier ones (scenes → entities → animators → timing → physics → composition → camera → randomness & determinism) — and each Learn page SHALL end with a complete embedded scene using that page's primitive. Guides SHALL be named after user tasks (e.g. "Export a video"), not module names.

#### Scenario: Learn pages form an ordered path

- **WHEN** a visitor reads the Learn section in sidebar order
- **THEN** no page depends on a concept introduced by a later page, and each page ends with a live embedded scene demonstrating its primitive

#### Scenario: Guides are task-named

- **WHEN** a visitor scans the Guides section
- **THEN** every entry is named for a task the visitor wants to accomplish (export a video, use the React player, load custom fonts, use images, define a custom entity, use the CLI)

### Requirement: Examples gallery teaches real ideas

Every entry in the Examples section SHALL demonstrate a nameable idea beyond the library API itself (e.g. a sine wave traced from a unit circle, a Bézier construction, a vector field) — the subject carries the visual interest, in the spirit of math-visualization galleries. Each entry SHALL present the rendered playing scene before its complete source. Generic shape-moves ("a circle moves right") SHALL NOT appear in the gallery.

#### Scenario: A gallery entry is a small explainer

- **WHEN** a visitor opens any Examples page
- **THEN** the page names the idea being visualized, plays the scene first, and shows the full runnable source beneath it

### Requirement: Embedded examples are full HD

Every example scene embedded in the docs SHALL declare 1920×1080 (16:9) settings; no example SHALL use a bespoke resolution.

#### Scenario: Uniform example resolution

- **WHEN** any example scene in the docs registry is inspected
- **THEN** its settings declare width 1920 and height 1080

## MODIFIED Requirements

### Requirement: Full public-API coverage

Every public capability of the library SHALL have a documented home. At minimum the docs SHALL cover: the scene/frame model (`Scene.make`/`run`/`stream`/`step`, `Settings`); the center-origin, y-up coordinate space; entities and instances (the built-in shapes, `instantiate`, polymorphic `children`, `visible`, `appendChild`/`removeChild`, `update`/`data`); animators (the base/To pair pattern, dual call forms, `tween`/`move`/`fade`, `wait`); physics (`spring`/`springTo` and presets); timing and easing (the named curves and custom functions); composition (`chain`, `all`, `stagger`, `fork`, `background`, `repeat`, `play`, `finish`); the camera (dolly/orbit/lookAt/follow — depth of field is currently disabled in the renderer and SHALL NOT be documented until it returns); determinism (seed and the frame-exact invariants); extensibility (userland builder functions that return instances, and custom render implementations registered through the renderer's `renderers` option — the entity union itself is closed); the React player (`Player`); export to video; fonts; and images. The particle system SHALL NOT be documented as a public capability while it awaits its rewrite.

#### Scenario: A newly-introduced API is documented

- **WHEN** a visitor looks for the entity-composition APIs (`children`, `visible`, `appendChild`)
- **THEN** each is documented with an explanation and, where illustrative, a live example

#### Scenario: Nested scenes and extensibility are documented

- **WHEN** a visitor looks for how to nest scenes (`Scene.play`) or extend rendering (userland builders, custom render implementations)
- **THEN** each has a documented home explaining it

#### Scenario: Particles are not documented

- **WHEN** a visitor searches the handwritten docs for particle content
- **THEN** no concept, guide, or example page documents the particle system, and no example scene imports it

### Requirement: Documentation is accurate to the current API

Documentation content SHALL reflect the current public API. It SHALL NOT describe removed or changed behavior — in particular, the coordinate space is documented as center-origin and y-up with center-anchored shapes; `Text` is documented as a plain-string leaf (not a rich-text tree); scene structure as children-defined (not via a per-instance `parent` argument); and video export as using the bundled ffmpeg by default.

#### Scenario: Coordinate-space prose matches the engine

- **WHEN** a visitor reads any page that states or diagrams coordinates
- **THEN** it describes the center-origin, y-up space with center-anchored shapes, with no top-left-origin or y-down remnants

#### Scenario: No stale rich-text content

- **WHEN** a visitor reads the text documentation
- **THEN** it describes plain-string `Text` and composition via `children`, with no reference to the removed rich-text tree, `strong`/`emphasis` nodes, or `Motion.reveal`

#### Scenario: Export docs reflect the bundled binary

- **WHEN** a visitor reads the export documentation
- **THEN** it states that video encoding uses the bundled ffmpeg by default, with a `binary` override for a system ffmpeg
