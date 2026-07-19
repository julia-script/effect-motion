# react-player Specification (delta)

## ADDED Requirements

### Requirement: Typed scene props with conditionally-required renderLayers
`Player` and `usePlayer` SHALL be generic over the scene (`PlayerProps<S extends Scene.AnyScene>`), using type-level accessors (`Scene.AnyScene`, `Scene.Resources<S>`, `Scene.Error<S>`) exported from the core package. When `Scene.Resources<S>` is `never`, a `renderLayers` prop SHALL NOT be accepted; otherwise `renderLayers: Layer<Scene.Resources<S>>` SHALL be required — a resource-carrying scene without a covering layer is a compile-time error. The provided layer SHALL merge into the player's per-mount runtime so loader construction (eager loads included) happens with runtime construction. The player SHALL NOT read scene annotations (the mechanism no longer exists).

#### Scenario: Loader-free scene needs no prop
- **WHEN** a scene of type `Scene<never, Runner>` is passed to the Player without `renderLayers`
- **THEN** the props typecheck

#### Scenario: Resource-carrying scene demands the layer
- **WHEN** a scene of type `Scene<never, FontLoader<"Roboto"> | Runner>` is passed without `renderLayers`
- **THEN** the props do not typecheck; passing a `Layer<FontLoader<"Roboto">>` makes them typecheck

## MODIFIED Requirements

### Requirement: Loading and error status reflect the engine
The player's status SHALL be `loading` until the engine is available, the per-mount runtime (including every `renderLayers` loader's eager load) is constructed, and the first frame is buffered — then `ready`. A failed engine acquisition (e.g. blocked wasm fetch) or a failed loader load at runtime construction SHALL surface as the player's `error` status carrying the failure — rendered visibly, not merely logged — rather than a silent hang.

#### Scenario: Ready only when engine, loaders, and first frame are available
- **WHEN** the first frame is buffered but a renderLayers font load has not settled (or vice versa)
- **THEN** the player status is `loading`, becoming `ready` once engine, loaders, and first frame are all available

#### Scenario: Engine acquisition failure is surfaced
- **WHEN** the wasm cannot be loaded
- **THEN** the player enters the `error` status carrying the failure, not an indefinite loading state

#### Scenario: Loader failure is surfaced visibly
- **WHEN** a font load effect in `renderLayers` fails (e.g. network 404) during runtime construction
- **THEN** the player enters the `error` status and displays the failure instead of playing without the font
