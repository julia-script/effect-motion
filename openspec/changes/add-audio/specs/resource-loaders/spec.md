# resource-loaders Specification (delta)

## MODIFIED Requirements

### Requirement: Resource constructors produce yieldable constants
`effect-motion` SHALL provide `Font.Font(id)`, `Image.Image(id)` and `Audio.Audio(id)` constructors taking a literal string id. The returned constant SHALL be yieldable inside a scene generator: `yield*` succeeds with the resource value (`{ _tag, id }`, matching `Font.schema` / `Image.schema` / `Audio.schema` for entity props) and adds the corresponding loader (`FontLoader<ID>` / `ImageLoader<ID>` / `AudioLoader<ID>`) to the effect's requirements. The yield SHALL NOT dereference the loader at runtime (the requirement is type-level only at authoring). Non-literal ids (plain `string`) SHALL be rejected at the type level so `FontLoader<string>` cannot enter a scene's requirements.

#### Scenario: Yielding a font in a scene
- **WHEN** a scene generator runs `const font = yield* Font.Font("Roboto")` and passes `font` to an entity's `fontFamily`
- **THEN** the scene's type is `Scene<E, FontLoader<"Roboto"> | Runner>` and the stored frame data carries `{ _tag, id: "Roboto" }`

#### Scenario: Non-literal id rejected
- **WHEN** `Font.Font(someString)` is called with a value typed `string`
- **THEN** the call is a compile-time type error

## ADDED Requirements

### Requirement: Prepared metadata services are not loaders
Services carrying data a scene explicitly inspects (starting with `AudioMetadata<ID>`) SHALL NOT carry the loader brand, so `ExcludeLoaders` keeps them and `Scene.run`/`Scene.stream` require them. They SHALL be immutable and prepared before frame generation.

#### Scenario: Metadata passes through ExcludeLoaders
- **WHEN** `ExcludeLoaders` is applied to `AudioLoader<"theme"> | AudioMetadata<"theme">`
- **THEN** the result is `AudioMetadata<"theme">`
