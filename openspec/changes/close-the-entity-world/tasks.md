Ordering follows the migration plan in `design.md`: capture a determinism baseline, prove the trait-removal argument (D3) before relying on it, then port core → animators → renderer → consumers so breakage moves in one direction. `pnpm check` failure count is the progress metric through sections 3–7; it is expected to be non-zero mid-port.

## 1. Baseline and guardrails

- [ ] 1.1 Record the pre-existing failure baseline: run `pnpm test`, `pnpm check`, `pnpm lint` on a clean tree and save the output — the port is judged by no NEW failures, and the repo has known pre-existing breakage
- [ ] 1.2 Capture determinism baselines: pick a representative set of scenes (springs, eased tweens, groups, a Line, a Path, seeded randomness) and save their derived/rendered frame values. Compare values, not raw frame JSON — field renames make a byte-diff useless
- [ ] 1.3 Audit `apps/docs/examples/*.scene.ts` for `transform/matrix` usage and record any scene relying on shear; these have no migration path (design Risks)
- [ ] 1.4 Inventory every consumer of `Entity`, `Instance`, and trait exports across all packages, so section 8 can verify nothing was missed

## 2. Schema foundation

- [ ] 2.1 Finalize `packages/motion/src/schemas.ts`: entity union, `EntityMap`, `EntityByTag`, `getEntityDefinitionByTag`, `Entry`
- [ ] 2.2 Add the shared mixins: `transformMixin` (`position`/`rotation` as `Vec3`) and an appearance mixin (`scale` as `Vec3` default `(1,1,1)`, `opacity` default `1`, `visible` default `true`), applied to every paintable member so no entity can omit or rename them
- [ ] 2.3 Give `Camera` `position` and `rotation` ONLY — no scale, opacity, or visible. It is the single non-paintable entity, already omitted from the frame's instance map (design D9)
- [ ] 2.4 Confirm `opacity` is present on every paintable member. The current code has it on every shape via `Shape2D.filled` or an explicit spread; the schema sketch dropped it, so this restores existing behavior uniformly rather than adding a field
- [ ] 2.5 Make geometry relative to `position`: `Line.start`/`Line.end` as `Vec3` offsets (drop `x2`/`y2`/`z2`); add `position` to `Path` with commands as offsets from it
- [ ] 2.6 Define `Instance<Tag>` with the phantom tag parameter (design D1) — `{ _tag, id, kind }`, one string-literal parameter, not the three-parameter generic
- [ ] 2.7 Confirm `Image` and `Text` still carry resource references as plain `{ _tag, id }` schema fields — resources are out of scope and must not be touched
- [ ] 2.8 Nothing consumes the new schema yet; `pnpm check` should be no worse than the 1.1 baseline

## 3. Prove the trait-removal argument (gate)

- [ ] 3.1 Port "Moving a Line does not stretch it" as a transform test against the relative-geometry model
- [ ] 3.2 Port "Moving a Line in depth keeps it rigid"
- [ ] 3.3 Port "Moving a Group moves its children"
- [ ] 3.4 **Gate:** confirm all three pass by writing `position` alone, with no branch on entity tag inside any animator. If any needs per-entity special-casing, STOP — design D3 is wrong and must be revisited before continuing (design Risks)

## 4. Core plumbing

- [ ] 4.1 Rewrite `Runner`'s `Entry`/`RunnerTree` to store `{ id, state }` with the union as state; resolve definitions by tag from `EntityMap` (design D4)
- [ ] 4.2 Retype `Runner.instantiate`, `getDataUnsafe`, `setDataUnsafe` against `Instance<Tag>` and the union; drop the `Schema.Struct.Fields` generics
- [ ] 4.3 Convert the camera default-filling special-case to a `props._tag === "Camera"` discriminant check (design D7) — keep the behavior, drop the cast
- [ ] 4.4 Keep children normalization behavior exactly as specified by `instance-children` (no delta was written for it); retype against the union
- [ ] 4.5 Retype `Scene.instantiate`, `Scene.data`, `Scene.update` against `Instance<Tag>`
- [ ] 4.6 Update `Runner.state` to emit typed union data per entry, with `visible` as an ordinary field
- [ ] 4.7 Keep `Camera` an ordinary tree entry — do NOT collapse it into a dedicated runner field or singleton while simplifying. Multiple cameras must still be able to coexist, with `activeCameraId` selecting the frame's view (design: multiple simultaneous cameras)
- [ ] 4.8 Add a `ponytail:` comment at the frame-contract seam recording the ceiling: one active camera per frame; upgrade path is a frame carrying a list of views. Cross-reference the existing precomp camera marker in `Sync.ts`. Comment only — build no view abstraction

## 5. Animators

- [ ] 5.1 Collapse `animatePosition`'s lens into direct field access: read `data.position`, flatten to `{x,y,z}`, rebuild on write (design D2). Do NOT make `interpolate` nested-aware
- [ ] 5.2 Collapse `animateOpacity` the same way against `data.opacity`
- [ ] 5.3 Verify channel-level sparseness survives nesting: `moveTo(rect, { x: 100 })` animates x and holds y/z; a partial `Vec3` must never reach `interpolate` (design D8)
- [ ] 5.4 Verify the `startValues` loud-failure guard still fires for a channel with no current value — it is what prevents NaN frames
- [ ] 5.5 Verify field-level sparseness: a target naming only `width` leaves `scale` untouched, and vice versa (design D8)
- [ ] 5.6 Replace trait constraints with tag constraints on `move`/`moveTo`, `fade`/`fadeTo`. With `opacity` universal across paintable entities, `Camera` is the only instance the gate must reject — verify `fade(camera, …)` fails compilation naming the missing field
- [ ] 5.7 Do the same for `Physics.spring`/`springTo`; confirm spring settle frames are unchanged against the 1.2 baseline
- [ ] 5.8 Confirm dual call forms (`Instance.isInstance` dispatch on the first argument) still work for every animator

## 6. Delete the trait system

- [ ] 6.1 Remove `TraitLens`, `EntityTraits`, `PartialTraits`, `TraitKey`, `traitOrDie`, `Position` from `Entity.ts`
- [ ] 6.2 Remove `positionLens`/`opacityLens` from `Shape2D.ts` and every per-entity lens declaration under `shapes/`
- [ ] 6.3 Remove `Entity.make`, `AnyEntity`, `EntityData`, `is`, `isEntity`; delete `Entity.ts` and `Instance.ts` if nothing remains
- [ ] 6.4 Delete `packages/motion/test/traits.test.ts` — its scenarios now live in the section 3 transform tests
- [ ] 6.5 Remove `Group`'s `TransformMatrix`, `TransformOperation`, `identityTransform`, `multiplyTransforms`, and the transform-operation DSL
- [ ] 6.6 Grep for `~position`, `~opacity`, `~visible`, `$visible`, `~transform3d` across all packages — zero hits outside archived specs

## 7. Renderer

- [ ] 7.1 Change `Sync.ts` dispatch from `entry.entity.name` to `_tag` narrowing
- [ ] 7.2 Key the entity-renderer registry on the tag union so an unregistered entity fails the build rather than throwing at runtime
- [ ] 7.3 Delete `packages/renderer/src/FrameData.ts` and replace each reader with direct or narrowed field access
- [ ] 7.4 Update the `visible` read at the renderer seam — the rename from `~visible` is small and easily lost in a large diff (design D6)
- [ ] 7.5 Update Group/Hud handling to compose the uniform transform instead of consuming an affine matrix
- [ ] 7.6 Confirm `Hud` still dispatches distinctly from `Group` despite identical data

## 8. Consumers and verification

- [ ] 8.1 Update `packages/react` public types
- [ ] 8.2 Port every `apps/docs/examples/*.scene.ts` to the new field vocabulary; handle any shear-dependent scene found in 1.3
- [ ] 8.3 Update MDX docs in `apps/docs/content/` that reference traits, `x`/`y`/`z` fields, or transform operations
- [ ] 8.4 Work through the 1.4 inventory and confirm every consumer is ported
- [ ] 8.5 Run `pnpm check`, `pnpm test`, `pnpm lint` — no NEW failures against the 1.1 baseline
- [ ] 8.6 Diff determinism against the 1.2 baseline; any per-frame value change other than a field rename is a regression to investigate, not to accept
- [ ] 8.7 Run `pnpm lint:fix`; confirm no non-null assertions and no biome-ignore suppressions were introduced (repo convention — use the `unreachable` helper)
- [ ] 8.8 Review the full diff for out-of-scope changes, especially to `Resource.ts`/`Font.ts`/`Image.ts` — resources must be untouched (design Non-Goals)

## 9. Specs

- [ ] 9.1 Sync the deltas: `openspec sync --change close-the-entity-world`
- [ ] 9.2 Confirm the `traits` capability is removed and its behavioral scenarios live in `entity-transform`
- [ ] 9.3 Confirm the resolved drifts: `instance-visibility` no longer specifies `$visible`, `object-depth` no longer requires `~transform3d`
- [ ] 9.4 Note the remaining known-stale `shapes` requirements (`Visible defaults` specifies black fills and SVG output; `Rect corner radii` references SVG semantics) — pre-existing drift, deliberately NOT fixed here; propose a separate cleanup change
- [ ] 9.5 Archive the change: `openspec archive close-the-entity-world`
