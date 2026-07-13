# scene-metadata

## ADDED Requirements

### Requirement: Scenes carry an annotations context
A scene value SHALL carry an `annotations` Context and provide `annotate(key, value)` and `annotateMerge(context)` that return a new scene value sharing the same body. The runtime SHALL never read annotations.

#### Scenario: Annotating a scene
- **WHEN** a scene is annotated with an editor label
- **THEN** the returned scene exposes the label in its annotations and plays identically to the original

#### Scenario: Annotations are immutable per value
- **WHEN** a scene is annotated
- **THEN** the original scene value's annotations are unchanged
