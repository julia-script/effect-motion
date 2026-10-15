# Spec Delta

## ADDED Requirements

### Requirement: Uniform rounded rectangles

`Rect` SHALL carry a finite numeric `cornerRadius` defaulting to 0. The authored value SHALL remain unchanged in scene data and be animatable with both call forms of `Motion.tween` and `Motion.tweenTo`, landing exactly on the target. Rendering SHALL clamp the radius to `[0, min(abs(width), abs(height))/2]`. Signed dimensions SHALL preserve their existing reflection semantics and zero dimensions SHALL remain collapsed.

#### Scenario: Sharp default and negative radius
- **WHEN** radius is omitted, zero, or negative
- **THEN** the Rect renders with its existing sharp contour

#### Scenario: Pill and circle limits
- **WHEN** radius exceeds half the smaller absolute dimension
- **THEN** rendering uses that half-dimension, yielding a pill or a circle for equal dimensions, without changing authored data

#### Scenario: Finite radius validation
- **WHEN** a Rect is constructed with NaN or an infinite cornerRadius
- **THEN** schema validation rejects it

#### Scenario: Exact animation targets
- **WHEN** cornerRadius is tweened using either call form of either raw animator
- **THEN** intermediate frame data interpolates and the final value equals the requested target even outside the rendered range

### Requirement: Rounded rectangle contour rendering

The rounded fill and outline SHALL use the same centered local contour, following position, rotation, scale, and depth together. Outline trim and dashes SHALL compose on this contour without clipping the fill, and overlapping planar stroke fragments SHALL paint opacity once. Geometry SHALL be deterministic with bounded tessellation and exact straight-to-arc endpoints. Appearance-only updates SHALL reuse geometry. Replaced or removed per-instance resources SHALL be released without disposing shared unit geometry.

#### Scenario: Geometry updates
- **WHEN** dimensions or effective radius change
- **THEN** the fill and outline update together, including transitions to and from radius zero

#### Scenario: Trim and dash composition
- **WHEN** a rounded Rect combines trimStart, trimEnd, trimOffset, strokeDasharray, and strokeDashoffset
- **THEN** the selected dashed outline follows the rounded contour while the complete fill remains visible

#### Scenario: Retained resources
- **WHEN** only color or opacity changes, then the rectangle changes radius or is removed
- **THEN** geometry is first reused and subsequently released when replaced or removed, while other shapes using shared geometry remain valid
