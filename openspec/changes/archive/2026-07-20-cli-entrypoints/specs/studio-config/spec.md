# studio-config Specification (delta)

## ADDED Requirements

### Requirement: studioConfig helper types the studio entrypoint
`@effect-motion/cli` SHALL export a browser-safe `studioConfig` identity helper that brands and returns its input; a `studio.ts` entrypoint default-exports its result. The input SHALL carry a `scenes` RECORD whose keys are the unique picker identifiers and whose values are either a bare scene or an entry object `{ scene, ...playerOptions }`, where the player options are the `PlayerProps` preview subset (`fps`, `autoPlay`, `defaultRepeatMode`, `isInfinite`, `prebufferedFrames`, `bufferCapacity`, `settings`) typed against `@effect-motion/react`'s actual `PlayerProps` (no hand-copied mirror). The module MUST stay free of Node-only imports (the studio app imports it directly in the browser).

#### Scenario: Record entries in both shapes
- **WHEN** a studio.ts declares `scenes: { "hello-world": helloWorld, orbit: { scene: orbit, fps: 30 } }`
- **THEN** the module typechecks, and both entries are usable by the studio with the orbit entry carrying its player options

#### Scenario: Duplicate identifiers are impossible
- **WHEN** an author tries to register two scenes under the same key
- **THEN** the record shape makes this a TypeScript duplicate-property error at authoring time

### Requirement: One layers field covering the union of scene resources
`studioConfig` SHALL type its `layers` field against the union of all registered scenes' resource requirements (`Scene.Resources` over every entry's scene, distributing across the record). When that union is `never`, `layers` SHALL NOT be accepted; otherwise it SHALL be REQUIRED as a `Layer` providing the full union — a registered scene whose loader is missing from `layers` is a compile-time error.

#### Scenario: Missing loader for one scene fails compilation
- **WHEN** a studio.ts registers a scene requiring `FontLoader<"Pacifico">` and its `layers` omit that font
- **THEN** the module does not typecheck

#### Scenario: Loader-free studio takes no layers
- **WHEN** every registered scene has no resource requirements
- **THEN** a studio.ts passing `layers` does not typecheck, and one omitting it does

### Requirement: Display labels from scene names with key fallback
A scene entry's picker label SHALL be the scene value's display `name` when present, else the record key. The record key SHALL remain the entry's identity regardless of the label (names may collide; keys cannot).

#### Scenario: Named scene labels the picker
- **WHEN** a scene created with `Scene.make("The Grand Orbit", gen)` is registered under key `orbit`
- **THEN** the picker shows "The Grand Orbit" and selecting it previews the `orbit` entry

#### Scenario: Unnamed scene falls back to its key
- **WHEN** an unnamed scene is registered under key `hello-world`
- **THEN** the picker shows "hello-world"
