# react-player Delta Specification

## MODIFIED Requirements

### Requirement: ThorVG-backed canvas rendering
The React player SHALL render frames through `@effect-motion/renderer`'s browser adapter onto a `<canvas>` it owns, sized from frame metadata. Frame production (the scene stream, read-ahead buffer, and rAF playback clock) SHALL be unchanged from the streaming player.

#### Scenario: Player mounts a canvas viewport
- **WHEN** a `Player` is rendered for a scene
- **THEN** its viewport contains a `<canvas>` element sized to the frame's resolution

#### Scenario: Frames render onto the canvas
- **WHEN** the current frame changes
- **THEN** that frame is synced into the retained three scene and rendered onto the player's canvas

### Requirement: Loading and error status reflect the engine
The player's status SHALL be `loading` until the renderer is acquired and initialized (including pipeline pre-warm), the per-mount runtime (including every `renderLayers` loader's eager load) is constructed, and the first frame is buffered — then `ready`. A failed renderer acquisition (e.g. WebGPU unavailable) or a failed loader load at runtime construction SHALL surface as the player's `error` status carrying the failure — rendered visibly, not merely logged — rather than a silent hang.

#### Scenario: Ready only when renderer, loaders, and first frame are available
- **WHEN** the first frame is buffered but a renderLayers font load has not settled (or vice versa)
- **THEN** the player status is `loading`, becoming `ready` once renderer, loaders, and first frame are all available

#### Scenario: Renderer acquisition failure is surfaced
- **WHEN** the renderer cannot initialize (e.g. WebGPU unavailable and no working fallback)
- **THEN** the player enters the `error` status carrying the failure, not an indefinite loading state

#### Scenario: Loader failure is surfaced visibly
- **WHEN** a font load effect in `renderLayers` fails (e.g. network 404) during runtime construction
- **THEN** the player enters the `error` status and displays the failure instead of playing without the font

## ADDED Requirements

### Requirement: Per-player scoped renderer lifecycle
Each mounted player SHALL acquire its own renderer bound to its canvas through `@effect-motion/renderer`'s scoped lifecycle, released on unmount. Acquisition SHALL include pipeline pre-warm so playback does not stutter on the first frame.

#### Scenario: Unmount releases the renderer
- **WHEN** a player unmounts
- **THEN** its renderer's scope closes and its GPU resources are disposed

## REMOVED Requirements

### Requirement: Shared, lazily-acquired engine
**Reason**: There is no process-level wasm engine to share — three renderers are per-canvas, and the browser's WebGPU device is managed by the platform.
**Migration**: Each player owns a scoped renderer (see ADDED requirement); nothing is shared across players.

### Requirement: Configurable wasm location with a working default
**Reason**: No wasm asset exists in the three-backed player; three.js ships as ordinary JS modules through the bundler.
**Migration**: Remove any `wasmBaseUrl`-style configuration from player usage; no replacement needed.
