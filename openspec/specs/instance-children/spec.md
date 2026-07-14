# instance-children Specification

## Purpose
TBD - created by syncing change refactor-text-and-children. Update Purpose after review.

## Requirements

### Requirement: Instantiation accepts a polymorphic children list

`Scene.instantiate` SHALL accept an optional `children` entry in an entity's input whose value is an ordered list whose elements are each one of: a plain string, an `Instance`, or an `Effect` that resolves to an `Instance`. Instantiation SHALL normalize this list into stored child ids in list order:

- a **string** SHALL be instantiated into a `Shapes.Text` (with the string as its `text`) and contribute the new instance's id;
- an **`Effect<Instance>`** SHALL be evaluated (yielded) internally by `instantiate` — the call site SHALL NOT be required to `yield*` a nested `instantiate` — and contribute the resolved instance's id;
- an **`Instance`** SHALL contribute its own id without re-instantiation.

The value STORED for the entity's `children` field SHALL be an `Array<string>` of ids, identical in shape to what the renderer already consumes. Normalization order SHALL match list order so paint order is preserved.

#### Scenario: String child becomes a Text

- **WHEN** an entity is instantiated with `children: ["hello"]`
- **THEN** a `Shapes.Text` with `text: "hello"` is instantiated and its id is stored as the parent's first child

#### Scenario: Nested instantiate effect is yielded internally

- **WHEN** an entity is instantiated with `children: [Scene.instantiate(Shapes.Text, { text: "world" })]` and the nested `instantiate` is NOT itself `yield*`-ed
- **THEN** `instantiate` evaluates the nested effect and stores the resolved instance's id as a child

#### Scenario: Already-instantiated child contributes its id

- **WHEN** a child instance is created first and then passed in `children: [child]`
- **THEN** the parent stores `child.id` without creating a new instance

#### Scenario: Mixed children preserve order

- **WHEN** an entity is instantiated with `children: ["a", child, Scene.instantiate(Shapes.Text, { text: "c" })]`
- **THEN** the stored children ids are, in order: the Text for "a", `child.id`, and the Text for "c"

#### Scenario: Stored children are ids, not nodes

- **WHEN** any entity is instantiated with a polymorphic `children` list
- **THEN** the stored `children` value is an `Array<string>` of instance ids, unchanged in shape from a directly-authored id array
