## REMOVED Requirements

### Requirement: Lens-shaped entity traits, all-or-nothing

**Reason**: Traits normalized access across entities whose shapes were unknowable in an open entity world. The world is now closed (see `entity-model`): an entity's full field set is statically derivable from its `_tag`, so there is nothing left to normalize and nothing to declare per entity.

**Migration**: None required — traits were never part of the authoring surface. Code that declared lenses deletes them; code that read through a lens reads the schema field directly (`data.position`, `data.opacity`).

### Requirement: Built-in shapes implement semantic traits

**Reason**: The per-entity semantics this requirement encoded were compensating for a flat, absolute coordinate model. `Line`'s lens shifted `x2`/`y2`/`z2` by the position delta so translation would not stretch the line; `Group`'s lens moved its subtree via a bespoke affine. Under `entity-transform`, geometry is relative to the entity's own `position` and transforms compose down the tree, so both behaviors are automatic and no per-entity semantics remain to declare.

**Migration**: The behaviors themselves are preserved as requirements in `entity-transform` — "Moving a Line does not stretch it", "Moving a Line in depth keeps it rigid", and "Moving a Group moves its children" migrate verbatim as scenarios there. They are the falsifying check on this removal: if either behavior requires per-entity handling after the change, the removal is wrong.

### Requirement: Trait detection

**Reason**: Type-level trait constraints are replaced by tag constraints — an animator requiring `opacity` constrains on the tags that carry it, and the compiler names the missing field rather than a `~opacity` sigil. The runtime defect for an absent trait becomes unreachable: with a closed union there is no untyped path by which an entity can lack a field its tag declares.

**Migration**: Consumers relying on the compile-time gate keep it, in stronger form. No runtime behavior to migrate — the defect could only fire for cases the closed world makes impossible.

### Requirement: Trait-based helper families

**Reason**: The helper families remain; only their implementation vehicle changes. They now read and write schema fields directly instead of routing through a declared lens pair.

**Migration**: No authoring change. `move`/`moveTo`, `fade`/`fadeTo`, and `spring`/`springTo` keep their signatures, dual call forms, easing, exact-final-frame and settle-exact guarantees, and instance-resolving behavior. The requirement is restated in `entity-transform` under "Semantic animators target fields, not traits", which additionally requires that per-frame values be unchanged.
