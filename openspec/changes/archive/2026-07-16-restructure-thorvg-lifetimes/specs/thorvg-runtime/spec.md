# thorvg-runtime (delta)

## MODIFIED Requirements

### Requirement: Scoped module acquisition
The package SHALL expose the ThorVG module as an Effect `Context.Service` whose acquisition is an idempotent process-level singleton: acquisition initializes the wasm once (or adopts an already-initialized module) and reads the fully-named module handle. In the browser, release SHALL be a no-op — the module is a page-lifetime singleton and is never terminated by a scope. In Node, release SHALL run `term()` for process/test isolation. Module initialization SHALL NOT leak as an un-scoped global side-effect beyond the upstream glue's own `__ThorVGModule` global.

#### Scenario: Module acquired within a scope
- **WHEN** a program provides the ThorVG layer and yields the service
- **THEN** it receives a `ThorVGModule` whose `_tvg_*` functions are callable, and wasm initialization has run exactly once for the process

#### Scenario: Browser release leaves the engine alive
- **WHEN** a scope that acquired the engine closes in a browser environment while other consumers exist
- **THEN** `term()` is not called and other consumers continue rendering

#### Scenario: Node release terminates
- **WHEN** the enclosing scope closes on the Node layer
- **THEN** `term()` is called and the module is released

#### Scenario: Node and browser differ only in wasm location and release
- **WHEN** the Node layer or the browser layer provides the service
- **THEN** both run the same initialization code path, differing only in how the `.wasm` file is located (`locateFile`) and in release semantics

## ADDED Requirements

### Requirement: Keeper canvas pins the engine
Engine acquisition SHALL create one hidden minimal canvas (the keeper) that lives as long as the engine, so ThorVG's refcounted `Initializer` never reaches zero while the engine is held and the engine's font table survives the deletion of any other canvas. On the Node path the keeper is deleted immediately before the release `term()`.

#### Scenario: Fonts survive canvas deletion
- **WHEN** a font is loaded, a working canvas is deleted, and a new canvas renders text in that font
- **THEN** the glyphs render (the font table was not wiped by the deletion)

### Requirement: Session-scoped canvases
Render canvases (other than the keeper) SHALL be scoped `acquireRelease` resources: created when a render session opens, resized in place when the target size changes within the session, and deleted when the session closes. The package SHALL NOT retain a never-deleted canvas cache keyed by size.

#### Scenario: Canvas freed on session close
- **WHEN** a render session closes (success, failure, or interrupt)
- **THEN** its canvas is deleted

#### Scenario: Resize within a session
- **WHEN** the target size changes between frames of one session
- **THEN** the same canvas is resized in place, not replaced by a second canvas

#### Scenario: Two sessions render independently
- **WHEN** two sessions with different sizes render concurrently on one engine
- **THEN** each renders through its own canvas and closing one does not affect the other

### Requirement: Render session bundles canvas and fonts
The package SHALL expose a render-session resource that, on open, acquires a canvas at the requested size and acquires the requested fonts (per the thorvg-fonts capability), and on close releases both. Consumers (player mounts, export runs) SHALL interact with the canvas/fonts pair only through a session.

#### Scenario: Session opens with fonts ready
- **WHEN** a session is opened with a family→source font map
- **THEN** after open, text in those families renders on the session's canvas

#### Scenario: Session close releases fonts
- **WHEN** the only session holding a family closes
- **THEN** that family's refcount reaches zero and the registry releases the hold (engine unload is best-effort per the thorvg-fonts capability)
