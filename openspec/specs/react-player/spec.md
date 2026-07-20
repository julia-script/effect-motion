# react-player Specification

## Purpose
The three.js/WebGPU-backed React player: `usePlayer`/`<Player>` rendering scene frames onto a canvas through a per-mount scoped renderer, with async latest-frame-wins rendering and a browser-safe package surface.
## Requirements
### Requirement: Canvas rendering through the renderer package
The React player SHALL render frames through `@effect-motion/renderer`'s browser adapter onto a `<canvas>` it owns, sized from frame metadata. Frame production (the scene stream, read-ahead buffer, and rAF playback clock) SHALL be unchanged from the streaming player.

#### Scenario: Player mounts a canvas viewport
- **WHEN** a `Player` is rendered for a scene
- **THEN** its viewport contains a `<canvas>` element sized to the frame's resolution

#### Scenario: Frames render onto the canvas
- **WHEN** the current frame changes
- **THEN** that frame is synced into the retained three scene and rendered onto the player's canvas

### Requirement: Per-player scoped renderer lifecycle
Each mounted player SHALL acquire its own renderer bound to its canvas through `@effect-motion/renderer`'s scoped lifecycle, released on unmount. Acquisition SHALL include pipeline pre-warm so playback does not stutter on the first frame.

#### Scenario: Unmount releases the renderer
- **WHEN** a player unmounts
- **THEN** its renderer's scope closes and its GPU resources are disposed

### Requirement: Asynchronous render with latest-frame-wins
Because rendering requires the async engine, frame rendering SHALL be asynchronous, and a superseded frame's in-flight render SHALL NOT overwrite a newer frame. The most recently requested frame SHALL be the one displayed.

#### Scenario: A newer frame supersedes a slow render
- **WHEN** frame N+1 is requested before frame N's render completes
- **THEN** the canvas ends on frame N+1, not frame N

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

### Requirement: Browser-safe package surface
The renderer packages SHALL keep Node-only code (modules importing `node:*` built-ins) out of the browser-reachable entry points, so a bundler compiling the player for the browser does not pull in `node:fs`/`node:zlib`. Node-only functionality SHALL be reachable through dedicated subpath exports.

#### Scenario: Browser bundle excludes Node modules
- **WHEN** a bundler builds the player for the browser from the packages' default (`.`) entry points
- **THEN** no module importing a `node:*` built-in is included in the browser bundle

#### Scenario: Node adapters remain available via a subpath
- **WHEN** a Node program needs the PNG/buffer output adapters or the Node (Dawn) device layer
- **THEN** they are importable from a dedicated subpath (not the browser-safe default entry)

### Requirement: Typed scene props with conditionally-required renderLayers
`Player` and `usePlayer` SHALL be generic over the scene (`PlayerProps<S extends Scene.AnyScene>`), using type-level accessors (`Scene.AnyScene`, `Scene.Resources<S>`, `Scene.Error<S>`) exported from the core package. When `Scene.Resources<S>` is `never`, a `renderLayers` prop SHALL NOT be accepted; otherwise `renderLayers: Layer<Scene.Resources<S>>` SHALL be required — a resource-carrying scene without a covering layer is a compile-time error. The provided layer SHALL merge into the player's per-mount runtime so loader construction (eager loads included) happens with runtime construction. The player SHALL NOT read scene annotations (the mechanism no longer exists).

#### Scenario: Loader-free scene needs no prop
- **WHEN** a scene of type `Scene<never, Runner>` is passed to the Player without `renderLayers`
- **THEN** the props typecheck

#### Scenario: Resource-carrying scene demands the layer
- **WHEN** a scene of type `Scene<never, FontLoader<"Roboto"> | Runner>` is passed without `renderLayers`
- **THEN** the props do not typecheck; passing a `Layer<FontLoader<"Roboto">>` makes them typecheck

