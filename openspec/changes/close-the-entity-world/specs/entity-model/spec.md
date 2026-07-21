## ADDED Requirements

### Requirement: The entity set is a closed tagged union

The library SHALL define its entities as a closed `Schema.TaggedUnion` whose members are exactly: `Line`, `Path`, `Rect`, `Circle`, `Ellipse`, `Text`, `Group`, `Hud`, `Image`, and `Camera`. Each member SHALL be a `Schema.TaggedStruct` whose `_tag` is its entity name. An entity's complete field set SHALL be statically derivable from its `_tag` alone.

There SHALL be no public API for defining an entity outside the library. The generic `Entity<Name, Data, Traits>` interface, `Entity.make`, and `AnyEntity` are removed.

#### Scenario: Tag determines the full shape

- **WHEN** a value is narrowed to a single entity tag
- **THEN** all of that entity's fields are statically known, with no cast and no optionality introduced by the union

#### Scenario: Entities cannot be defined by consumers

- **WHEN** a consumer attempts to define a custom entity
- **THEN** no public API exists to do so — the union is closed at the library boundary

#### Scenario: Exhaustive matching over entities

- **WHEN** code matches on an entity's `_tag` and a member is unhandled
- **THEN** the omission is a compile-time error, not a runtime fallthrough

### Requirement: Entity definitions resolve from a static map

The library SHALL expose a static map from entity tag to entity definition, and a lookup that resolves a definition from a tag. Definitions SHALL NOT be carried by value through the system: any consumer holding a tag can obtain the definition.

#### Scenario: Definition by tag

- **WHEN** a definition is requested for a known tag
- **THEN** the matching entity definition is returned, typed to that tag

#### Scenario: Frame data carries tags, not definitions

- **WHEN** a frame is produced
- **THEN** each entry carries its entity data (including `_tag`) and no entity-definition object

### Requirement: Instances reference entities by tag

An `Instance` SHALL carry its instance `id` and its entity's tag (`kind`) — never the entity definition itself. The `Instance` type SHALL be parameterized by that tag so consumers can constrain which entities an operation accepts.

Instance identity comparison SHALL be by tag, not by definition-object reference.

#### Scenario: Instance holds an id and a tag

- **WHEN** an instance is created
- **THEN** it carries its id and its entity's tag, and its data is retrieved from the runner by id

#### Scenario: Tag comparison identifies an entity

- **WHEN** an instance is tested against an entity tag
- **THEN** the result is determined by tag equality and is correct across module boundaries

#### Scenario: Operations constrain on tags

- **WHEN** an operation declares that it accepts only entities carrying a given field
- **THEN** passing an instance whose tag lacks that field fails compilation

### Requirement: Uniform engine-owned visibility

Every entity SHALL carry a `visible` boolean field defaulting to `true`, declared as an ordinary schema field present on every union member. It SHALL be settable at instantiation and animatable as ordinary data. No sigil-prefixed (`$` or `~`) field namespace SHALL be reserved, and no reserved-namespace validation SHALL be performed.

Renderers MAY skip an instance whose `visible` is `false`; the engine SHALL make the field available on every frame so any renderer can decide.

#### Scenario: Default visible

- **WHEN** an instance is created with no `visible` key
- **THEN** its `visible` field is `true`

#### Scenario: Hidden at instantiation

- **WHEN** an instance is created with `{ visible: false }`
- **THEN** its `visible` field is `false` and it is stored as ordinary entity data

#### Scenario: Visibility available per frame

- **WHEN** a frame is produced
- **THEN** each entry's `visible` value is readable directly from its entity data

### Requirement: Renderer dispatch is exhaustive over tags

A renderer SHALL dispatch on an entity's `_tag`, and its entity-renderer registry SHALL be keyed by the tag union such that every member requires an implementation. An entity with no registered renderer SHALL be a compile-time error rather than a runtime failure.

#### Scenario: Missing renderer fails the build

- **WHEN** the entity union contains a member with no registered renderer
- **THEN** the renderer package fails to typecheck

#### Scenario: Renderers read typed data

- **WHEN** a renderer reads a field from frame data after narrowing on `_tag`
- **THEN** the field is typed with no cast and no per-field presence guard

### Requirement: Cameras are ordinary entities

`Camera` SHALL be an ordinary member of the entity union, instantiated, stored in the runner tree, and animated exactly like any other entity. It SHALL NOT be modelled as a singleton, a dedicated runner field, or anything structurally distinct from other union members.

Multiple `Camera` instances SHALL be able to coexist in a scene. Which one a frame reports as its view SHALL be a selection made at frame-production time, not a constraint on how many may exist.

This is a deliberate constraint on the implementation rather than a feature: it keeps a future multi-camera capability a change to the frame contract alone. Frames carrying more than one view are explicitly NOT part of this capability.

#### Scenario: Cameras instantiate like any entity

- **WHEN** a `Camera` is instantiated
- **THEN** it is created through the same path as any other entity and lives in the runner tree

#### Scenario: Multiple cameras coexist

- **WHEN** a scene instantiates two cameras and animates both
- **THEN** both exist and both animate; exactly one is reported as the frame's view

#### Scenario: Camera is not structurally special

- **WHEN** the runner's storage is inspected
- **THEN** cameras are held as ordinary entries, distinguished only by which id is currently selected as the view

### Requirement: Typed resources remain scene-scoped

The typed-resource system SHALL be unaffected by the closed entity world. An entity SHALL store only an `{ _tag, id }` reference to a resource as ordinary field data; the obligation to have loaded that resource SHALL remain in the scene's requirements type, discharged by providing the corresponding loader layer.

Frames SHALL remain free of resource bytes.

#### Scenario: Entity stores a reference only

- **WHEN** an entity carrying a font or image reference is inspected in frame data
- **THEN** it holds the resource's `{ _tag, id }` and no bytes

#### Scenario: Unprovided resource is a type error

- **WHEN** a scene uses a resource whose loader layer is not provided
- **THEN** the scene's requirements are unsatisfied and it fails to compile
