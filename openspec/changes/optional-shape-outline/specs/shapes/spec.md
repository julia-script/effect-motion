## MODIFIED Requirements

### Requirement: Portable styling props

Every built-in shape SHALL carry the uniform transform and appearance fields defined by `entity-transform` — `position`, `rotation`, `scale`, `opacity`, and `visible` — from shared mixins rather than per-shape declarations. Fillable shapes SHALL additionally carry `fillColor`; strokable shapes `strokeColor` and `strokeWidth`.

Every such field SHALL be ordinary schema data, animatable like any other field.

#### Scenario: Common props on all shapes

- **WHEN** any built-in shape is instantiated
- **THEN** its data carries the uniform transform, opacity, and visibility, and scene updates can animate them like any other field

#### Scenario: Every shape can fade

- **WHEN** any built-in shape is faded
- **THEN** its `opacity` animates — no shape lacks the field

#### Scenario: Shared fields come from mixins

- **WHEN** two shapes of the same kind (both filled, or both Line) are compared
- **THEN** their shared fields have identical names, shapes, and defaults, because both take them from the same mixin; a filled shape's outline and a Line's stroke come from different mixins because their defaults differ

### Requirement: Visible defaults

A default-constructed shape SHALL be visible: filled shapes (`Rect`, `Circle`, `Ellipse`, `Path`) default `fillColor` to white with `strokeColor` absent, so they draw no outline unless the scene sets one; `strokeWidth` defaults to 1 so setting `strokeColor` alone draws a 1-unit outline. `Line` defaults `strokeColor` to black with `strokeWidth` 1. `opacity` defaults to 1.

#### Scenario: Default circle has no outline

- **WHEN** a `Circle` is instantiated with only a radius
- **THEN** its data has fill white, opacity 1, and no `strokeColor`, and the renderer draws the fill with no outline

#### Scenario: Outline is opt-in

- **WHEN** a `Rect` is instantiated with `strokeColor` set
- **THEN** the renderer draws a `strokeWidth`-wide outline in that color

#### Scenario: Tweening an unset outline color is loud

- **WHEN** `strokeColor` is tweened on a filled shape that never set it
- **THEN** the scene dies naming `strokeColor` rather than producing undefined frames

#### Scenario: Default line is visible

- **WHEN** a `Line` is instantiated with only endpoints
- **THEN** its data has stroke black and strokeWidth 1, and the renderer draws a visible line
