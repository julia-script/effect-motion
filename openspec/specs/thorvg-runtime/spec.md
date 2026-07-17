# thorvg-runtime Specification

## Purpose
The scoped Effect API over ThorVG's C-API: module acquisition as a service, acquireRelease paint lifecycles with parent-owns-child ownership transfer, scratch memory, and typed result-code errors, in the bindings-only `@effect-motion/thorvg` package.

## Requirements

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

### Requirement: Paint lifecycle via acquireRelease
Every ThorVG object constructor (`_tvg_*_new`) SHALL be exposed as an `acquireRelease` resource that frees the object on scope close, so user code never calls a raw `delete`/`del`/`unref`.

#### Scenario: Constructed paint freed on scope close
- **WHEN** a shape/scene/gradient/text/animation is constructed inside a scope and never added to a parent
- **THEN** its ThorVG destructor runs when the scope closes

#### Scenario: Constructor null return is a failure
- **WHEN** a `_new` constructor returns a null (0) pointer
- **THEN** the effect fails with `ThorvgException` naming the constructor, and no finalizer is registered for a null pointer

### Requirement: Ownership transfer on add
Adding a paint to a parent (canvas or scene) SHALL transfer ownership to the parent so the child is not double-freed. A per-paint ownership flag SHALL gate the child's finalizer: the finalizer frees only while the paint is still owned by the scope, and `add` clears that flag.

#### Scenario: Added child not freed by its own finalizer
- **WHEN** a shape is constructed and then added to a scene, and the scope closes
- **THEN** the shape's own finalizer does not free it (the parent owns it), and no double-free occurs

#### Scenario: Detached paint still freed
- **WHEN** a paint is constructed (or duplicated) and never added to any parent
- **THEN** its finalizer frees it on scope close

#### Scenario: Attachment is the only ownership-transferring path
- **WHEN** a paint is attached to a parent
- **THEN** it is attached through the `add` operation (the only operation that clears the ownership flag); the raw low-level add is not exposed

### Requirement: Typed error mapping from result codes
C-API calls SHALL be wrapped so a non-success ThorVG result code (or a thrown error) becomes a typed `ThorvgException` carrying the result code and the operation name.

#### Scenario: Non-zero result code fails loudly
- **WHEN** a wrapped `_tvg_*` mutator returns a non-zero result code
- **THEN** the effect fails with `ThorvgException` carrying that code and the operation name

#### Scenario: Success passes through
- **WHEN** a wrapped call returns the success code (0)
- **THEN** the effect succeeds with the operation's value

### Requirement: Scoped scratch memory
Out-parameters and packed input arrays SHALL use a scratch-memory helper that pairs `_malloc` with `_free` through `acquireRelease`, with typed HEAP read/write access, so scratch is freed even on interruption.

#### Scenario: Out-param read then freed
- **WHEN** a getter that writes into malloc'd memory (e.g. axis-aligned bounding box) is called
- **THEN** the value is read from the correct HEAP view and the scratch memory is freed on scope close

#### Scenario: Scratch freed on interruption
- **WHEN** an effect using scratch memory is interrupted before completing
- **THEN** the malloc'd scratch is still freed

### Requirement: Raw-pointer boundary
The API SHALL operate only on raw numeric pointers (a branded pointer type) and SHALL NOT construct or accept `@thorvg/webcanvas` wrapper objects, so ThorVG's `FinalizationRegistry` never observes API-owned pointers and cannot race scope-based cleanup.

#### Scenario: Pointers are branded
- **WHEN** an API operation takes or returns a ThorVG object handle
- **THEN** it is a branded pointer type distinct from a plain number and from any webcanvas wrapper object

### Requirement: End-to-end draw with cleanup
The package SHALL demonstrate a full draw path — construct a canvas, construct a shape, set fill, add the shape, draw/sync, produce output — with all resources released on scope close.

#### Scenario: Rect drawn to a buffer
- **WHEN** the smoke path constructs a canvas and a filled rectangle, adds it, and draws
- **THEN** it yields rendered output and, on scope close, every constructed object is freed exactly once with no double-free

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
