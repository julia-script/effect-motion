# motion-renderer Specification

## Purpose
The single frame renderer, backed by three.js/WebGPU through the `@effect-motion/three` wrapper: the tree walk into a retained three scene, the `build`/`update`/`dispose` entity contract, GPU depth-buffer occlusion and DoF post chain, and the Node (PNG readback) and browser (canvas) output adapters — one renderer, no pluggable sinks.

## Requirements

### Requirement: Single three-backed frame renderer
The `@effect-motion/renderer` package SHALL be the single frame renderer, backed by three.js through the bindings-only `@effect-motion/three` wrapper. It SHALL be the only place frames meet three: it depends on `effect-motion` (frames, entities, color, camera resolution) and on the wrapper; core SHALL carry no renderer dependency, and the wrapper SHALL NOT know about frames, entities, or projection. There SHALL NOT be a generic pluggable-sink factory, a per-`(sink × entity)` render-function registry, or an intermediate virtual-node type. The renderer SHALL be a long-lived scoped service: acquired once, holding retained render state across frames, released on scope close.

#### Scenario: One renderer, no sink registry
- **WHEN** the renderer package is inspected for render targets
- **THEN** there is a single three-backed renderer and no generic sink factory or per-`(sink × entity)` context registry

#### Scenario: Core is renderer-free
- **WHEN** a scene is run via `Scene.run`/`stream`/`play`
- **THEN** it produces `Frame` objects without referencing any renderer, and `effect-motion`'s dependency tree contains no renderer or three.js packages

#### Scenario: Renderer outlives a frame
- **WHEN** many frames render through one renderer scope
- **THEN** renderer state (three scene, GPU pipelines, retained objects) is acquired once and reused, not rebuilt per frame

### Requirement: Frame pipeline preserved
The renderer SHALL walk a frame's instance tree composing ancestor world translations, sync the result into its retained three scene, and render world content with GPU depth-buffer occlusion; `Shapes.Hud` subtrees render camera-independent after and above world content (see the hud-layer capability). Translucent content at equal or near-equal depth SHALL draw in a deterministic order derived from the stable instance-id tie-break. Hidden instances (`$visible === false`) and their subtrees SHALL be skipped. A duplicate parent / cycle SHALL be a loud defect naming the instance. An unknown or missing instance id SHALL be a loud defect.

#### Scenario: Deterministic order on depth ties
- **WHEN** multiple translucent paintables share a view depth
- **THEN** they blend in ascending instance-id order, identically across runs and across browser and Node

#### Scenario: HUD tier renders after the world tier
- **WHEN** a frame contains both world and Hud content
- **THEN** all world content renders beneath every Hud element

#### Scenario: Hidden subtree skipped
- **WHEN** an instance has `$visible === false`
- **THEN** neither it nor its descendants appear in the retained scene

#### Scenario: Cycle is a defect
- **WHEN** an instance is referenced by more than one parent, or a cycle exists
- **THEN** the renderer dies with a defect naming the offending instance id

### Requirement: Direct-paint entity contract
Each entity type SHALL have a retained render implementation providing `build` (create the three object on first appearance), `update` (mutate it when data or world position changed), and `dispose` (release its GPU resources when the instance leaves the frame), plus billboard participation. There SHALL be no intermediate description/virtual-node value returned by an entity. The set of render implementations SHALL be exhaustive over the built-in entity types at the type level (the renderer's manifest imports the built-in entity types from core and must cover them), so a missing built-in is a type error rather than a runtime surprise. Custom entities — defined in userland via core's Entity API — SHALL register their render implementation with the renderer package through the same contract; a frame referencing an entity with no implementation SHALL die with a defect naming the entity.

#### Scenario: Built-in coverage is a type-level guarantee
- **WHEN** a built-in entity type has no render implementation
- **THEN** the program fails to type-check

#### Scenario: Container paints nothing itself
- **WHEN** a container (Group / root) is rendered
- **THEN** it emits no object of its own; its position has already composed into its children's world coordinates during the walk

#### Scenario: Unchanged instances are not touched
- **WHEN** consecutive frames carry an instance with identical data and world position
- **THEN** its retained object is not updated between those frames

#### Scenario: Departed instances are disposed
- **WHEN** an instance present in frame N is absent from frame N+1
- **THEN** its object is removed from the three scene and its GPU resources disposed

### Requirement: Node and browser output adapters
The renderer SHALL share one sync/render path across Node and browser, differing only in device provision and how pixels leave the GPU. A Node adapter SHALL produce a PNG buffer via render-target readback through the wrapper's `/node` entry (Dawn). A browser adapter SHALL present onto a target `HTMLCanvasElement`.

#### Scenario: Node renders to a PNG buffer
- **WHEN** a frame is rendered under the Node adapter
- **THEN** the result is a PNG-encoded byte buffer of the frame

#### Scenario: Browser presents to a canvas
- **WHEN** a frame is rendered under the browser adapter with a target canvas
- **THEN** the frame is presented on that canvas

#### Scenario: Same sync path both environments
- **WHEN** the same frame is rendered under either adapter
- **THEN** the tree walk, retained sync, and render steps executed are identical; only device provision and pixel output differ

### Requirement: Path painted from projected subpaths
The renderer SHALL render a `Path` from its world-space subpath polylines (with per-point z) as three line geometry — no SVG d-string parsing anywhere in the pipeline, no CPU screen projection. `Path` SHALL be part of the exhaustive built-in manifest (the type-level coverage guarantee). Stroke width follows the world-unit stroke semantics; closed subpaths close their polyline.

#### Scenario: Path renders through the built-in manifest
- **WHEN** a frame contains a `Path` and no consumer-provided render implementations
- **THEN** the path renders through the built-in three render path

#### Scenario: Closed subpath closes its geometry
- **WHEN** a Path subpath ends with a `Z` command
- **THEN** the emitted polyline is closed

### Requirement: Render requires and resolves frame resources
Rendering SHALL accept a `Frame<Resources>` and require `Resources` in its effect requirements. For each resource id encountered in frame data, the renderer SHALL resolve the loader from context by rebuilding the string-derived tag (per `resource-loaders`); a missing loader SHALL be a loud defect naming the resource id. Registration into renderer state (font provisioning, image texture decode) SHALL happen lazily on first use of a resource within a renderer scope, from the loader's already-loaded bytes, and be cached for the scope — never re-registered per frame, and never fetched at render time. The default font's loader SHALL be auto-provided beneath caller-supplied context, overridable by the reserved `"sans-serif"` id.

#### Scenario: Loader resolved from frame data id
- **WHEN** a frame contains text with `fontFamily` id `"Roboto"` and a `FontLoader<"Roboto">` service is in context
- **THEN** the renderer resolves the loader via the tag rebuilt from the string `"Roboto"` and uses its bytes for glyph rendering

#### Scenario: Registration happens once per scope
- **WHEN** many frames referencing the same font render in one renderer scope
- **THEN** the font's bytes are provisioned once, on the first frame that uses it

#### Scenario: Missing loader is a defect naming the id
- **WHEN** a frame references a resource id with no loader in context
- **THEN** rendering dies with a defect whose message names that id

#### Scenario: Default font provided automatically
- **WHEN** a frame contains text using the default font and the caller supplied no loaders
- **THEN** rendering succeeds using the auto-provided default font bytes


### Requirement: Scene space maps to three with the 2D identity invariant
Scene coordinates remain y-down with origin at the top-left and +z toward the viewer; the renderer SHALL map them to three's space (origin shifted to the viewport center, y flipped). Content at z=0 under an untouched camera SHALL land exactly where a pure-2D placement puts it, so scenes not using depth render as plain 2D.

#### Scenario: Flat scene renders flat
- **WHEN** a scene uses no z and never touches the camera
- **THEN** every shape appears at its authored (x, y) position and size

### Requirement: Billboard semantics
Circles, ellipses, unrotated rects/squares, images, and text SHALL be view-plane billboards (oriented to the camera each frame) so they keep their authored silhouette under any camera orbit. A rect with nonzero orientation SHALL tilt as a plane in 3D instead of billboarding.

#### Scenario: Circles stay circular through an orbit
- **WHEN** the camera orbits a circle at depth
- **THEN** the circle renders as a circle every frame, scaled by its distance

#### Scenario: Rotated rect foreshortens
- **WHEN** a rect has nonzero `rotY` and the camera looks along z
- **THEN** the rect renders as a perspective-foreshortened plane, not a billboard

### Requirement: World-unit perspective-correct strokes
Line and path strokes SHALL be rendered with world-unit widths: stroke width is a world-space dimension foreshortened per-pixel by perspective, so a line receding in depth thins continuously along its length. This intentionally replaces ThorVG's single-scale-per-segment approximation.

#### Scenario: A receding line thins along its length
- **WHEN** a line spans from near the camera to far from it
- **THEN** its rendered stroke width decreases continuously from the near end to the far end

### Requirement: Frame metadata drives viewport and background
Each frame's width, height, and background color SHALL come from frame metadata; the camera projection (field of view from focal length, aspect from the viewport) SHALL be updated per frame from the frame's camera.

#### Scenario: Background color animates
- **WHEN** frame metadata's background color changes across frames
- **THEN** the rendered background follows it frame-exactly

### Requirement: Sized-group comps composite through render targets
A sized group (clip / background / opacity over a subtree) SHALL composite its subtree through a render target: children clip to the group's bounds, the group's background fills behind them, and group opacity applies to the composited result as a whole (not per-child). Unsized groups remain pure coordinate composition with no paint isolation.

#### Scenario: Group opacity applies to the composite
- **WHEN** a sized group with opacity 0.5 contains two overlapping opaque children
- **THEN** the overlap region shows the group at 0.5 over the backdrop — not the children blended into each other at 0.5 each

### Requirement: Structural determinism, not pixel determinism
Given the same frame data, the renderer SHALL produce the same retained scene-graph structure — same objects, transforms, material parameters, and draw order. Rendered pixels SHALL look the same across environments but are NOT required to be byte-identical; tests SHALL assert structure or loose visual similarity, never byte equality of pixels.

#### Scenario: Same frame, same structure
- **WHEN** the same frame is synced twice into fresh renderers
- **THEN** the retained graphs are structurally identical (object set, transforms, materials, render order)

