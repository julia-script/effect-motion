## ADDED Requirements

### Requirement: Optional point of interest

The camera SHALL carry optional `poiX`/`poiY`/`poiZ` numeric fields (world coordinates of a point of interest). When present, the effective view orientation SHALL be derived by auto-orienting the camera toward the POI, with the explicit Euler fields composing after auto-orient (exact composition: the explicit rotation applies in the camera's own frame, then the aim), so a lone `rotZ` rolls about the view axis and the POI stays centered. When absent, the camera SHALL behave exactly as a one-node camera — existing scenes render byte-identical. The Runner SHALL NOT fill POI fields (explicit opt-in). The user's `rotX`/`rotY`/`rotZ` data SHALL never be overwritten by auto-orient — derivation happens at view-assembly time. The POI fields SHALL be plain numeric fields, tweenable and springable like any other. A partially-set POI (one or two of the three fields) SHALL be a loud defect at the point of use.

#### Scenario: Auto-orient toward the POI

- **WHEN** a camera has a POI set off its optical axis
- **THEN** the rendered view is rotated so the POI projects to the viewport center (before explicit Euler)

#### Scenario: Dutch angle composes after aim

- **WHEN** a camera aimed at a POI also sets `rotZ`
- **THEN** the view rolls about the view axis while remaining aimed at the POI

#### Scenario: Absent POI preserves current behavior

- **WHEN** a scene never sets POI fields
- **THEN** rendered output is identical to the one-node camera before this change

#### Scenario: POI is animatable

- **WHEN** a scene runs `Motion.tweenTo(camera, { poiX: 300 }, "1 second")` or springs a POI field
- **THEN** the aim animates frame-by-frame like any numeric field

#### Scenario: Orbit identity

- **WHEN** a resting camera's POI sits on its optical axis
- **THEN** the derived orientation is zero and the view equals the resting view exactly
