# font-loading Specification (delta)

## REMOVED Requirements

### Requirement: Scenes declare fonts via the Fonts annotation
**Reason**: The annotation model is replaced by typed resource loaders — fonts are now scene *requirements* (`FontLoader<ID>` in the Scene's `R` channel), not untyped tooling-facing metadata. The `Fonts` module (`FontResource`, annotation key, accessors, `urlMap`) is deleted along with the annotation mechanism itself.
**Migration**: Declare fonts with `Font.Font("<family>")`, yield the constant in the scene, and pass the value to `fontFamily`. Provide bytes via `Font.layer(font, loadEffect)` at render time (see the `resource-loaders` capability).

### Requirement: Player loads declared fonts before ready
**Reason**: The player no longer reads scene annotations; loading moved to loader-layer construction (eager, at runtime build), and readiness/error semantics are specced under `react-player`.
**Migration**: Pass a covering layer via the player's `renderLayers` prop; readiness gates on runtime construction, which includes every provided load.

## ADDED Requirements

### Requirement: Missing font loader is a loud defect at render
Rendering a frame containing text whose `fontFamily` id has no corresponding loader in context SHALL die with a defect naming the font id. There SHALL be no silent glyph fallback for undeclared fonts. (This is the runtime backstop for the accepted cooperative-typing boundary: hand-built resource values bypass the type-level accounting but not this check.)

#### Scenario: Undeclared font defects with its name
- **WHEN** a frame carries a Text with `fontFamily` id `"Comic"` and no `FontLoader` for `"Comic"` is in context
- **THEN** rendering dies with a defect whose message names `"Comic"`

#### Scenario: Declared fonts render normally
- **WHEN** every font id in the frame has a loader in context
- **THEN** rendering succeeds and each text uses its font's bytes
