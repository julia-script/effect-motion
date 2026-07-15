# Spec: react-player

## ADDED Requirements

### Requirement: ThorVG-backed canvas rendering
The React player SHALL render frames through the single ThorVG renderer's browser adapter onto a `<canvas>` it owns, sized from frame metadata. It SHALL NOT depend on any SVG sink. Frame production (the scene stream, read-ahead buffer, and rAF playback clock) SHALL be unchanged from the streaming player.

#### Scenario: Player mounts a canvas viewport
- **WHEN** a `Player` is rendered for a scene
- **THEN** its viewport contains a `<canvas>` element sized to the frame's resolution

#### Scenario: Frames blit onto the canvas
- **WHEN** the current frame changes
- **THEN** that frame is rendered through the ThorVG browser adapter onto the player's canvas

### Requirement: Shared, lazily-acquired engine
The ThorVG engine SHALL be acquired asynchronously on first use and shared across all players through one process-level runtime, so multiple players do not each acquire a separate wasm engine. The engine SHALL be reused for every frame render rather than re-acquired per frame.

#### Scenario: One engine across players
- **WHEN** two players are mounted on the same page
- **THEN** they share a single acquired ThorVG engine (one wasm module), not one each

#### Scenario: Engine acquired once, reused per frame
- **WHEN** many frames are rendered
- **THEN** the engine is acquired once (on first render) and reused; no per-frame engine acquisition occurs

### Requirement: Asynchronous render with latest-frame-wins
Because rendering requires the async engine, frame rendering SHALL be asynchronous, and a superseded frame's in-flight render SHALL NOT overwrite a newer frame. The most recently requested frame SHALL be the one displayed.

#### Scenario: A newer frame supersedes a slow render
- **WHEN** frame N+1 is requested before frame N's render completes
- **THEN** the canvas ends on frame N+1, not frame N

### Requirement: Configurable wasm location with a working default
The player SHALL locate the ThorVG `.wasm` from a base URL that defaults to a working CDN location (pinned to the packaged `@thorvg/webcanvas` version) and SHALL accept an override option for consumers serving the asset elsewhere or operating offline.

#### Scenario: Works with no configuration
- **WHEN** a player is used without specifying a wasm location
- **THEN** it loads the `.wasm` from the default pinned CDN URL

#### Scenario: Override is honored
- **WHEN** a player is given an explicit wasm base URL
- **THEN** it loads the `.wasm` from that URL instead of the default

### Requirement: Loading and error status reflect the engine
The player's status SHALL be `loading` until both the engine is available and the first frame is buffered, then `ready`; a failed engine acquisition (e.g. blocked wasm fetch) SHALL surface as the player's `error` status rather than a silent hang.

#### Scenario: Ready only when engine and first frame are available
- **WHEN** the first frame is buffered but the engine has not finished acquiring (or vice versa)
- **THEN** the player status is `loading`, becoming `ready` once both are available

#### Scenario: Engine acquisition failure is surfaced
- **WHEN** the wasm cannot be loaded
- **THEN** the player enters the `error` status carrying the failure, not an indefinite loading state

### Requirement: Browser-safe package surface
The renderer packages SHALL keep Node-only code (modules importing `node:*` built-ins) out of the browser-reachable entry points, so a bundler compiling the player for the browser does not pull in `node:fs`/`node:zlib`. Node-only functionality SHALL be reachable through dedicated subpath exports.

#### Scenario: Browser bundle excludes Node modules
- **WHEN** a bundler builds the player for the browser from the packages' default (`.`) entry points
- **THEN** no module importing a `node:*` built-in is included in the browser bundle

#### Scenario: Node adapters remain available via a subpath
- **WHEN** a Node program needs the PNG/buffer output adapters or the Node wasm layer
- **THEN** they are importable from a dedicated subpath (not the browser-safe default entry)
