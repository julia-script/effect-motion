# Alpha Masks Specification

## Purpose

Alpha masks let one animatable scene subtree reveal or hide another while preserving the scene's existing tree, camera spaces, and depth behavior.

## Requirements

### Requirement: Typed mask attachment

`Scene.setMask(target, source, options?)` SHALL attach an existing paintable instance as the mask source for an existing paintable target and SHALL replace a prior attachment on that target. `options.mode` SHALL be `"alpha"` or `"inverse"` and SHALL default to `"alpha"`. `Scene.clearMask(target)` SHALL remove the attachment; clearing an unmasked target SHALL be a no-op. These operations SHALL be Effects that make their changes in scene time without advancing a frame. The type signatures SHALL reject `Camera` as either argument. A source SHALL have at most one target at a time; a target SHALL have at most one direct source.

#### Scenario: Attach and replace
- **WHEN** a Rect is masked by a Circle, then `setMask` replaces that source with a Text instance
- **THEN** the Rect has exactly one mask, from the Text, on the replacement frame

#### Scenario: Camera is not maskable
- **WHEN** a caller passes a Camera as target or source
- **THEN** TypeScript rejects the call

#### Scenario: Clear and reattach
- **WHEN** `clearMask` removes a target's mask and `setMask` later reattaches it
- **THEN** the intervening frames are unmasked and later frames use the new attachment

### Requirement: One instance tree and deterministic frame references

Mask sources SHALL be ordinary `Line`, `Path`, `Rect`, `Circle`, `Ellipse`, `Text`, `Image`, `Group`, or `Hud` instances in the existing instance tree. Masking SHALL NOT create, clone, or reparent instances or create another child tree. A frame SHALL carry plain, serializable target-id to source-id/mode references sufficient to render it without authoring handles; repeated runs with the same scene and settings SHALL produce identical mask references and frame counts. Existing motion helpers SHALL animate source and target independently, with their usual exact endpoints.

#### Scenario: Independent motion
- **WHEN** a Circle source moves across a stationary masked Text while the Text opacity animates
- **THEN** both states advance independently and repeated runs produce identical frames ending at the exact requested values

#### Scenario: One parent per instance
- **WHEN** a source is attached to a target
- **THEN** each retains its original parent and appears once in the frame's instance tree

### Requirement: Alpha-only source coverage

For each output pixel, the mask SHALL use the source's rendered alpha coverage `M` in `[0,1]`, including geometry edges, fill/stroke alpha, text glyph coverage, image alpha, opacity, and ancestor opacity. Source RGB and luminance SHALL have no effect. Normal mode SHALL yield content alpha `A × M`; inverse mode SHALL yield `A × (1 − M)`. The target's color SHALL be preserved. A source `visible: false` or outside the current view SHALL supply zero coverage. A Group source SHALL combine eligible descendant coverage by ordinary alpha-over compositing in the source's depth and paint order, excluding descendant roots reserved as other active sources; a played scene source SHALL use the alpha of its bounded composite, including its background.

#### Scenario: Partial transparency
- **WHEN** source coverage is `0.4` over content alpha `0.5`
- **THEN** normal content alpha is `0.2` and inverse content alpha is `0.3`

#### Scenario: Color independence
- **WHEN** two sources have identical alpha geometry but different RGB colors
- **THEN** they produce the same mask

#### Scenario: Image and text coverage
- **WHEN** transparent pixels of an Image or empty space between Text glyphs cover a target
- **THEN** normal mode hides those target pixels and inverse mode reveals them

### Requirement: Source-only visibility and nested masks

While a source is referenced, its subtree SHALL contribute to that source's mask coverage but SHALL NOT paint into the ordinary world or HUD output. A descendant that is itself the root of another active source SHALL be excluded from its enclosing source's coverage; it contributes only when its own source is evaluated. Clearing or replacing an attachment SHALL restore the former source's ordinary visibility, subject to its own `visible` and ancestor state. A source's coverage SHALL include its own direct mask and masks on included descendants, but SHALL NOT inherit mask factors attached to ancestors above the source root. It SHALL still inherit those ancestors' transforms and ordinary opacity. A mask on a plain Group or Hud SHALL apply to each drawable descendant without turning that container into a flattened paint layer; descendants SHALL retain their transforms, relative alpha, and participation in their tier's depth ordering. Masks on descendants SHALL compose multiplicatively with ancestor masks in ordinary output, evaluating each attachment's selected normal or inverse factor exactly once. A mask source MAY itself be masked by another source, provided the reference graph is acyclic.

#### Scenario: Source does not show beside content
- **WHEN** a visible red Circle masks a blue Rect
- **THEN** the Circle's RGB is absent from the ordinary scene and only the blue Rect shows through its coverage

#### Scenario: Masked Group retains interleaving
- **WHEN** a masked Group has children at depths on both sides of an unrelated world sibling
- **THEN** those children still interleave with the sibling by depth, each clipped by the Group mask

#### Scenario: Nested factors
- **WHEN** a masked child is inside a masked Group
- **THEN** its alpha is multiplied by both selected mask factors

#### Scenario: Nested source root is suppressed in enclosing source
- **WHEN** Group G is a mask source and its child C is also an active source for another target
- **THEN** C contributes no coverage to G's source pass, while C's own source pass includes its eligible descendants

#### Scenario: Ancestor mask applies once
- **WHEN** source S and target T are siblings inside masked Group G
- **THEN** S's coverage for T uses G's transform and opacity but excludes G's mask factor, and T's ordinary output receives G's mask factor exactly once

#### Scenario: Source root has its own mask
- **WHEN** source S is itself masked by source R
- **THEN** S's coverage includes R's selected factor, while masks attached above S in the instance tree are excluded from S's source pass

### Requirement: Coordinate, tier, and composition boundaries

A mask source and its target SHALL be mounted in the same composition and render tier. In the world tier, each SHALL use its own composed tree transform and that composition's active camera; in the HUD tier, each SHALL use its own composed transform and the identity HUD camera. Their projected alpha SHALL be matched in composition pixels, regardless of their different parents or depth. Source depth SHALL determine occlusion within the source rendering but SHALL NOT determine whether it can mask content at another depth. A `Scene.play` mount group SHALL be a composition plane in its parent: a parent-tier mask on that group SHALL mask the plane, while a mask within the child scene SHALL use the child's camera and bounds. Cross-composition and world-to-HUD references SHALL fail with named diagnostics.

#### Scenario: Camera moves source and target projection
- **WHEN** the world camera moves while a source and target have distinct world positions
- **THEN** their coverage overlap follows their projections through that camera

#### Scenario: HUD stays fixed
- **WHEN** a Hud child masks another Hud child and the world camera moves
- **THEN** the mask and target remain fixed in the HUD tier and sharp over world content

#### Scenario: Nested composition boundary
- **WHEN** a parent masks a played scene's mount group and the child has its own internal mask
- **THEN** the internal mask is resolved inside the child's bounds through its camera, and the outer mask applies to the resulting plane through the parent's camera

### Requirement: Masked depth and depth of field

For an ordinary world target, masking SHALL preserve every target drawable's own fragment depth and existing depth ordering against unmasked content, including separate subpaths or strokes within one Path instance. Masking SHALL NOT preblend different target depths into one image before those fragments compete with unrelated scene content. Fully removed pixels SHALL neither color nor occlude; fully opaque covered pixels of an opaque target SHALL retain normal depth occlusion. Partially transparent masked pixels SHALL follow the renderer's existing translucent depth behavior. Depth of field SHALL use the target's depth after masking, with mask edges blurred as part of that target; source depth SHALL NOT independently affect blur. The existing limitation for semi-transparent content under depth of field SHALL apply. HUD masks and targets SHALL remain exempt from world depth of field. A played scene SHALL still render sharp internally and take only its parent's depth of field at its composited plane.

#### Scenario: Mask holes reveal objects behind
- **WHEN** an opaque world target masks to zero coverage at a pixel and a farther object occupies that pixel
- **THEN** the farther object is visible there

#### Scenario: Focus follows content
- **WHEN** an off-focus masked object is rendered with depth of field
- **THEN** its revealed pixels and mask edge blur according to that object's depth, regardless of source depth

#### Scenario: Partially transparent target retains its depth
- **WHEN** a Rect with intrinsic alpha `0.5` is masked by an opaque Circle at a depth distinct from a sibling and the background
- **THEN** its revealed pixels blend at the Rect's depth, respect the sibling's depth order, and use the Rect's depth for the existing depth-of-field approximation even though its ordinary material writes no depth

#### Scenario: Path subpaths interleave with a sibling
- **WHEN** one masked Path has overlapping near and far subpaths at alpha `0.5`, and an opaque sibling lies between their depths
- **THEN** the far subpath remains hidden behind the sibling while the near subpath blends in front, exactly as their unmasked fragments would at the same mask coverage

### Requirement: Valid references and lifecycle

An attachment SHALL reject missing, destroyed, or unmounted instances; identical source and target; overlapping source/target subtrees in either direction; a source already used by another target; reference cycles; and cross-tier or cross-composition pairs. Diagnostics SHALL name the offending instance ids and reason. An atomic reparent within the same tier and composition SHALL retain the attachment and recompute both transforms. A reparent that makes an attached pair invalid SHALL fail loudly; `Scene.removeChild` detaching either endpoint or an ancestor of it SHALL clear affected attachments. Destroying an endpoint or any ancestor that leaves it unmounted SHALL clear affected attachments, including attachments whose endpoints survive as orphaned descendants. Rendering a forged or stale frame SHALL validate references and fail with a named render diagnostic rather than silently painting incorrect content.

#### Scenario: Invalid ancestry
- **WHEN** a Group is selected as source for one of its own descendants
- **THEN** attachment fails naming both ids and the subtree relationship

#### Scenario: Detach restores source
- **WHEN** `Scene.removeChild` detaches a masked target
- **THEN** the attachment is cleared and its former source resumes ordinary rendering if still mounted and visible

#### Scenario: Valid reparent
- **WHEN** a source moves to a different parent in the same composition and tier
- **THEN** its mask remains attached and follows its new composed transform

#### Scenario: Destroyed ancestor orphans descendants
- **WHEN** a Group is destroyed and its children remain live but unmounted
- **THEN** every mask attachment involving any orphaned descendant is cleared, and any still-mounted former source resumes ordinary rendering

### Requirement: Shared renderer behavior and resource lifetime

Browser playback and headless export SHALL use the same frame mask contract and show visually equivalent results; byte-exact pixels are not required. A stable frame SHALL reuse retained mask resources rather than allocate new GPU targets or materials for every presentation. Replacing or clearing a mask, removing its instances, and closing the renderer SHALL release resources owned by that attachment. A custom entity renderer that cannot apply mask factors at its drawable fragments SHALL fail by name when its instance is masked; its unmasked rendering SHALL remain supported. Unmasked scenes SHALL retain their present rendering behavior and avoid mask work. Documentation and runnable examples SHALL demonstrate normal, inverse, partially transparent, and animated masks on a leaf and a Group.

#### Scenario: Stable frame reuse
- **WHEN** the same masked frame is presented repeatedly
- **THEN** mask render resources are reused and output remains visually stable

#### Scenario: Browser and Node parity
- **WHEN** the same masked frames are played in a browser and exported in Node
- **THEN** their masking, depth placement, and composition boundaries look equivalent

#### Scenario: Unmasked fast path
- **WHEN** a frame has no mask references
- **THEN** it follows the existing unmasked rendering behavior without allocating mask resources

#### Scenario: Unsupported custom masked renderer
- **WHEN** a custom renderer without fragment-level mask support is used for a masked instance
- **THEN** rendering fails naming that entity and the missing mask-fragment capability, while its unmasked rendering still works
