# resource-loaders Specification

## Purpose
TBD - created by archiving change typed-resource-loaders. Update Purpose after archive.
## Requirements
### Requirement: Resource constructors produce yieldable constants
`effect-motion` SHALL provide `Font.Font(id)` and `Image.Image(id)` constructors taking a literal string id. The returned constant SHALL be yieldable inside a scene generator: `yield*` succeeds with the resource value (`{ _tag, id }`, matching `Font.schema` / `Image.schema` for entity props) and adds the corresponding loader (`FontLoader<ID>` / `ImageLoader<ID>`) to the effect's requirements. The yield SHALL NOT dereference the loader at runtime (the requirement is type-level only at authoring). Non-literal ids (plain `string`) SHALL be rejected at the type level so `FontLoader<string>` cannot enter a scene's requirements.

#### Scenario: Yielding a font in a scene
- **WHEN** a scene generator runs `const font = yield* Font.Font("Roboto")` and passes `font` to an entity's `fontFamily`
- **THEN** the scene's type is `Scene<E, FontLoader<"Roboto"> | Runner>` and the stored frame data carries `{ _tag, id: "Roboto" }`

#### Scenario: Non-literal id rejected
- **WHEN** `Font.Font(someString)` is called with a value typed `string`
- **THEN** the call is a compile-time type error

### Requirement: Loader tags with string-derived keys
Each resource constant SHALL expose its Context tag as a `.Loader` property — a tag whose key is derived deterministically from the resource kind and id (e.g. `effect-motion/Resources/FontLoader/<id>`). Rebuilding a tag from a runtime id string SHALL yield the same context entry as the authored constant's `.Loader`, so a consumer holding only frame data (`{ id: string }`) can resolve the loader.

#### Scenario: Tag rebuilt from frame data resolves the same service
- **WHEN** a context is built with `Font.Font("Roboto").Loader` and a consumer rebuilds a font loader tag from the string `"Roboto"`
- **THEN** the rebuilt tag resolves to the same service instance

### Requirement: Separate loader shapes under one shared brand
`FontLoader<ID>` and `ImageLoader<ID>` SHALL be distinct service interfaces (each free to carry kind-specific metadata) sharing a single loader brand. The `Resource` module SHALL provide `ExtractLoaders<R>` and `ExcludeLoaders<R>` type utilities written once against the brand: `ExtractLoaders` keeps exactly the branded members of a requirements union, `ExcludeLoaders` removes exactly those members, and non-loader services (e.g. `Runner`) pass through `ExcludeLoaders` unchanged.

#### Scenario: Utilities distribute over a mixed union
- **WHEN** the utilities are applied to `FontLoader<"Roboto"> | ImageLoader<"logo"> | Runner`
- **THEN** `ExtractLoaders` yields `FontLoader<"Roboto"> | ImageLoader<"logo">` and `ExcludeLoaders` yields `Runner`

### Requirement: Eager loading at layer construction
The layer helper (`Font.layer(font, loadEffect)` and the image analog) SHALL run the load effect once at layer construction and provide the loader service carrying the loaded data (for fonts at minimum `{ id, bytes }`, optionally format metadata). By the time any consumer reads a loader service, its bytes SHALL already be loaded — there SHALL be no lazy load path on the service. Every provided loader loads at construction regardless of whether the scene uses it. Retry/timeout policy composes on the load effect supplied by the caller.

#### Scenario: Load runs at construction, not at render
- **WHEN** a runtime is built with a font layer whose load effect records its execution
- **THEN** the load runs during runtime construction, exactly once, before any frame is rendered

#### Scenario: Unused provided fonts still load
- **WHEN** a layer provides two fonts and the scene uses one
- **THEN** both load effects run at construction

### Requirement: Requirements thread from authoring to render, excluded from run
A scene's loader requirements SHALL be excluded from the requirements of running it: `Scene.run`/`Scene.stream`/`Scene.play` for a scene of type `Scene<E, R>` SHALL require only `ExcludeLoaders<R>` (plus their usual services), and frame production SHALL succeed with no loader provided. Each produced frame SHALL carry the loaders as a phantom type parameter: `Frame<ExtractLoaders<R>>`. `Renderer.render` SHALL require the frame's loaders in its effect requirements, so rendering a resource-carrying frame does not compile without a covering layer.

#### Scenario: Running needs no loaders
- **WHEN** a scene declaring `FontLoader<"Roboto">` is run with no loader layer provided
- **THEN** frame production succeeds and frames are typed `Frame<FontLoader<"Roboto">>`

#### Scenario: Rendering demands the loaders
- **WHEN** `Renderer.render` is called with a `Frame<FontLoader<"Roboto">>` and no `FontLoader<"Roboto">` in context
- **THEN** the program does not typecheck; providing `Font.layer(Font.Font("Roboto"), ...)` makes it compile

### Requirement: Built-in default font
`effect-motion` SHALL provide `Font.default`, a built-in font resource with the reserved id `"sans-serif"`. Because it is a schema-level default (no `yield*`), it SHALL NOT appear in any scene's requirements. The render path SHALL auto-provide the default font's loader beneath user-provided layers, so a user layer for the `"sans-serif"` id overrides the built-in bytes. The reserved id and its override behavior SHALL be documented.

#### Scenario: Bare text renders with zero ceremony
- **WHEN** a scene instantiates a `Text` without specifying `fontFamily` and is rendered with no `renderLayers`
- **THEN** the text renders using the default font and the scene's type carries no loader requirement

#### Scenario: User layer overrides the default
- **WHEN** a user provides a loader for a font with id `"sans-serif"`
- **THEN** rendering uses the user's bytes for default-font text, not the built-in ones

