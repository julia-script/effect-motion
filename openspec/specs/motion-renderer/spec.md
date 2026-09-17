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
The renderer SHALL walk a frame's instance tree composing ancestor world translations, sync the result into its retained three scene, and render each context according to its declared compositing mode: paint contexts use current instance-tree paint order, and depth contexts use GPU depth-buffer occlusion; `Shapes.Hud` subtrees render camera-independent after and above world content (see the hud-layer capability). Within depth contexts, translucent content at equal or near-equal depth SHALL draw in a deterministic order derived from the stable instance-id tie-break. Hidden instances (`visible === false`) and their subtrees SHALL be skipped. A duplicate parent / cycle SHALL be a loud defect naming the instance. An unknown or missing instance id SHALL be a loud defect.

#### Scenario: Deterministic order on depth ties
- **WHEN** multiple translucent paintables in a depth context share a view depth
- **THEN** they blend in ascending instance-id order, identically across runs and across browser and Node

#### Scenario: HUD tier renders after the world tier
- **WHEN** a frame contains both world and Hud content
- **THEN** all world content renders beneath every Hud element

#### Scenario: Hidden subtree skipped
- **WHEN** an instance has `visible === false`
- **THEN** neither it nor its descendants appear in the retained scene

#### Scenario: Cycle is a defect
- **WHEN** an instance is referenced by more than one parent, or a cycle exists
- **THEN** the renderer dies with a defect naming the offending instance id

#### Scenario: Paint ordering is independent of creation history
- **WHEN** a paint context reorders existing siblings without changing their geometry or positions
- **THEN** the next frame blends them in the new children order, identically in browser and Node, regardless of retained object creation order

### Requirement: Direct-paint entity contract
Each entity type SHALL have a retained render implementation providing `build` (create the three object on first appearance), `update` (mutate it when data or world position changed), and `dispose` (release its GPU resources when the instance leaves the frame), plus billboard participation. There SHALL be no intermediate description/virtual-node value returned by an entity. The set of render implementations SHALL be exhaustive over the built-in entity types at the type level (the renderer's manifest imports the built-in entity types from core and must cover them), so a missing built-in is a type error rather than a runtime surprise. Custom entities — defined in userland via core's Entity API — SHALL register their render implementation with the renderer package through the same contract; a frame referencing an entity with no implementation SHALL die with a defect naming the entity.

#### Scenario: Built-in coverage is a type-level guarantee
- **WHEN** a built-in entity type has no render implementation
- **THEN** the program fails to type-check

#### Scenario: Container paints nothing itself
- **WHEN** a non-isolating container (inherited Group / root) is rendered
- **THEN** it emits no object of its own; its position has already composed into its children's world coordinates during the walk

#### Scenario: Unchanged instances are not touched
- **WHEN** consecutive frames carry an instance with identical data and world position
- **THEN** its retained geometry and paint data are not rebuilt between those frames; ordering metadata SHALL still change when its paint position changes

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
The renderer SHALL render a `Path` from its world-space subpath polylines (with per-point z) using renderer-owned stroke geometry or coverage masks — no SVG d-string parsing anywhere in the pipeline, no CPU screen projection. `Path` SHALL be part of the exhaustive built-in manifest (the type-level coverage guarantee). Stroke width follows the world-unit stroke semantics; closed subpaths close their polyline. Planar subpaths belonging to one entity SHALL participate in one stroke coverage union; splitting them into rendering segments SHALL NOT multiply stroke opacity. Nonplanar depth paths SHALL retain their per-point-depth rendering behavior.

#### Scenario: Path renders through the built-in manifest
- **WHEN** a frame contains a `Path` and no consumer-provided render implementations
- **THEN** the path renders through the built-in three render path

#### Scenario: Closed subpath closes its geometry
- **WHEN** a Path subpath ends with a `Z` command
- **THEN** the emitted polyline is closed

#### Scenario: Multiple planar subpaths overlap
- **WHEN** two subpaths in the same planar Path intersect and its stroke alpha is 0.5
- **THEN** their fully covered intersection has the same stroke opacity as the fully covered non-overlapping portions

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
An explicitly mounted scene SHALL composite through a render target using composition bounds and background from its scene metadata, not fields on Group. Children SHALL clip to those composition bounds. An explicit paint group SHALL also composite through a retained target, with transparent background and automatically derived content bounds that include stroke and antialiasing extents. In both cases group opacity SHALL apply to the composited result as a whole, not per-child. Inherited groups SHALL remain non-isolating.

#### Scenario: Group opacity applies to the composite
- **WHEN** an explicit paint group or scene mount with opacity 0.5 contains two overlapping opaque children
- **THEN** the overlap region shows the group at 0.5 over the backdrop — not the children blended into each other at 0.5 each

#### Scenario: Moving content expands paint-group bounds
- **WHEN** a paint group's child moves beyond its previous extent or its stroke grows
- **THEN** the complete visible content remains present without clipping or shifting its authored origin

### Requirement: Structural determinism, not pixel determinism
Given the same frame data, the renderer SHALL produce the same retained scene-graph structure — same objects, transforms, material parameters, and draw order. Rendered pixels SHALL look the same across environments but are NOT required to be byte-identical; tests SHALL assert structure or loose visual similarity, never byte equality of pixels.

#### Scenario: Same frame, same structure
- **WHEN** the same frame is synced twice into fresh renderers
- **THEN** the retained graphs are structurally identical (object set, transforms, materials, render order)

### Requirement: One opacity application per planar stroke
The renderer SHALL treat the entire stroke of a planar Rect, Circle, Ellipse, Line or Path as one painted region. Segment overlaps, joins, closure seams, retraced portions, self-crossings and overlaps between subpaths of the same Path SHALL contribute coverage to that region without accumulating paint opacity. This SHALL apply to flat content in paint contexts and planar strokes placed or tilted in depth contexts. Independent stroke entities SHALL remain independent painting operations. For this requirement a planar Path or Line has constant local z across its defining points; arbitrary nonplanar 3D paths are outside the guarantee.

#### Scenario: Triangle joins at half opacity
- **WHEN** a closed planar triangle is stroked at alpha 0.5
- **THEN** its fully covered corners and straight sections have the same stroke opacity, with no darker overlap patches

#### Scenario: Closed rectangle seam
- **WHEN** a planar rectangle outline closes at its starting point with fractional stroke alpha
- **THEN** the closure paints once and has no extra opacity compared with the other joins

#### Scenario: Retracing and self-crossing
- **WHEN** a planar Path retraces a segment or crosses itself
- **THEN** the common stroke region retains one application of its stroke opacity

#### Scenario: Separate entities still blend
- **WHEN** two separate fully covered strokes at alpha 0.5 overlap against the same opaque backdrop
- **THEN** they source-over composite as two paints, producing the equivalent of combined alpha 0.75 rather than being merged into one stroke

#### Scenario: Planar stroke in a depth scene
- **WHEN** a planar stroked rectangle is tilted in a depth context
- **THEN** joins still receive one application of stroke opacity and external geometry occludes it according to depth

### Requirement: Coverage remains distinct from paint opacity
The stroke region SHALL preserve fractional edge coverage and apply stroke color alpha and entity opacity once to that coverage. Changing opacity alone SHALL NOT change the silhouette, introduce opaque fringes or alter layering. A zero-opacity stroke SHALL have no visible or occluding effect. Transparent regions outside a stroke SHALL NOT hide other content.

#### Scenario: Fade a joined stroke
- **WHEN** the same joined stroke fades through opacity 0, 0.25, 0.5, 0.75 and 1
- **THEN** its fully covered regions fade uniformly and its antialiased boundary retains partial coverage without seams

#### Scenario: Empty interior in depth
- **WHEN** an unfilled stroked shape sits in front of another object
- **THEN** its interior and the transparent area outside its silhouette leave the other object visible

### Requirement: Fill and stroke are separate paints
The renderer SHALL paint a shape's fill separately from its stroke, with the stroke over the fill. Uniform stroke opacity SHALL NOT require uniform final pixel color where the backdrop differs. The stroke union SHALL preserve the authored stroke width and closure and SHALL NOT introduce endpoint-cap patches at interior joins.

#### Scenario: Translucent border over colored fill
- **WHEN** a centered translucent border straddles a colored fill and a different outer background
- **THEN** the two parts blend with their respective backdrops while joins do not receive additional stroke opacity

### Requirement: Planar stroke union is shared across output adapters
Browser playback and Node export SHALL use the same stroke-union semantics and produce visually equivalent joins and opacity. Repeated frames, changes in stroke width and entity removal SHALL not leave stale mask content or unbounded live resources.

#### Scenario: Resize and remove
- **WHEN** an outlined shape changes size and width, then is removed
- **THEN** its current frame contains only its current stroke coverage and later frames contain no residual stroke pixels

### Requirement: Fractional stroke geometry is preserved
Stroke rendering SHALL preserve finite positive fractional stroke widths and fractional positions without automatic pixel snapping or clamping to an integer minimum width. A zero-width stroke SHALL paint nothing. Perspective scaling SHALL remain based on authored scene-unit width rather than a screen-space hairline convention.

#### Scenario: Fractional width sweep
- **WHEN** strokes use widths 0.25, 0.5, 0.75, 1 and 1.5 scene units at a one-to-one scene-unit/device-pixel scale
- **THEN** they retain distinct fractional coverage rather than being rounded to zero or one pixel

#### Scenario: Smooth translation
- **WHEN** a one-unit stroke translates one scene unit over four seconds at 60 fps
- **THEN** rendered coverage follows the fractional positions without holding at integer pixel coordinates and jumping between them

#### Scenario: Perspective remains dimensional
- **WHEN** a world-unit stroke recedes from the camera in a depth context
- **THEN** its apparent width decreases with perspective, including through subpixel widths, without being pinned to a minimum screen width

### Requirement: Subpixel motion changes coverage smoothly
At an unchanged output scale, planar stroke edges SHALL redistribute coverage between neighboring pixels as their position or width changes. Horizontal, vertical, diagonal and curved portions SHALL use a consistent coverage convention. The renderer SHALL avoid conspicuous phase-dependent disappearance or abrupt apparent-width steps within the documented comparison matrix. Identical crispness or identical individual pixel values at every fractional phase SHALL NOT be required.

#### Scenario: Quarter-pixel offsets
- **WHEN** equal thin rectangles are compared at offsets 0, 0.25, 0.5 and 0.75 device pixels on each axis
- **THEN** edge softness can differ, but complete edges do not disappear and apparent stroke weight remains visually consistent

#### Scenario: Animated width crosses one pixel
- **WHEN** a stroke's projected width increases continuously from 0.25 to 1.5 device pixels
- **THEN** its coverage changes progressively without an integer-width threshold

### Requirement: Sampling quality survives compositing
Stroke masks, embedded paint surfaces and final output SHALL preserve antialiased coverage through composition and resizing. Coverage SHALL NOT be multiplied twice, thresholded into binary opacity during resolve, or lost because an intermediate target silently omits the required sampling behavior. Target sizing SHALL account for output scale, device pixel ratio and projected magnification without snapping the authored geometry.

#### Scenario: Direct and grouped comparison
- **WHEN** the same planar thin stroke is rendered directly and through a paint group at the same final size
- **THEN** the group introduces no conspicuous coverage loss, opacity shift or additional aliasing

#### Scenario: Output scale changes
- **WHEN** the canvas resizes or display pixel ratio changes while a scene is paused
- **THEN** the renderer updates required target resolutions while preserving the scene's positions and stroke widths

### Requirement: Stroke quality is verified by appearance and structure
The renderer SHALL support a reproducible diagnostic matrix recording authored width, offset, final output scale, device pixel ratio, orientation and frame. Browser and Node output SHALL look equivalent for matching output conditions. Verification SHALL inspect frame/geometry preservation and visual quality without byte-exact raster comparisons or cross-device pixel tolerances.

#### Scenario: Reproduce a quality finding
- **WHEN** a thin-stroke regression is reported from an embedded player
- **THEN** the fixture can be inspected both at native output size and at the reported display scale to separate renderer coverage from subsequent image resampling

#### Scenario: Cross-adapter review
- **WHEN** browser and Node render the same width/offset fixtures at matching dimensions
- **THEN** reviewers can compare smoothness and apparent stroke weight without requiring identical image bytes
