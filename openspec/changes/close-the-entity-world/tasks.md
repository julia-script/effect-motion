Ordering follows the migration plan in `design.md`: capture a determinism baseline, prove the trait-removal argument (D3) before relying on it, then port core → animators → renderer → consumers so breakage moves in one direction. `pnpm check` failure count is the progress metric through sections 3–7; it is expected to be non-zero mid-port.

## 1. Baseline and guardrails

- [x] 1.1 Record the pre-existing failure baseline: run `pnpm test`, `pnpm check`, `pnpm lint` on a clean tree and save the output — the port is judged by no NEW failures, and the repo has known pre-existing breakage
  - **Result:** test CLEAN (248 pass, 0 fail). lint CLEAN (0 errors). check: 15 errors, ALL `TS2352` in test files (`group` 10, `random` 2, `camera` 2, `schedule` 1), all casting from `~visible`-typed opaque `{}` data.
  - The 15 are a **symptom of this change's target**, not a baseline to preserve — they exist because open-world entity data types as `{}`. Target after the port is **0**, not "no worse than 15"; a survivor means the union isn't reaching test call sites.
  - Baseline saved to scratchpad `baseline/BASELINE.md`. Measured with the untracked `schemas.ts` sketch moved out of the tree — leaving it in contaminated the first run with 2 TS + 2 lint errors belonging to the WIP.
- [x] 1.2 Capture determinism baselines: pick a representative set of scenes (springs, eased tweens, groups, a Line, a Path, seeded randomness) and save their derived/rendered frame values. Compare values, not raw frame JSON — field renames make a byte-diff useless
  - Harness: `packages/motion/test/determinism-baseline.test.ts` (TEMPORARY — delete at 8.6). Writes `test/__baseline__/determinism.json`; re-running compares instead of rewriting. Readers normalize old AND new field shapes (`x/y/z` ↔ `position.x`, `~visible` ↔ `visible`, `x2/y2/z2` ↔ `start`/`end` offsets) so the same numbers are expected either side of the port.
  - Line endpoints are normalized to **absolute world coordinates** in both representations — the representation may change, the rendered geometry may not.
  - Captured: springs 2805 frames (settle-driven), easing 91, groups 73, line 61, path 37, seeded 50.
  - Already encodes the 3.4 gate as ground truth: the Line goes `(3.3,3.3,0)→(53.3,23.3,300)` then `(100,100,100)→(150,120,400)` — span `(50,20,300)` preserved, i.e. rigid in all three axes.
  - Backup copy in scratchpad `baseline/determinism.json` (1.7 MB; not committed).
- [x] 1.3 Audit `apps/docs/examples/*.scene.ts` for `transform/matrix` usage and record any scene relying on shear; these have no migration path (design Risks)
  - **Zero scenes use it. The shear risk is hypothetical — downgrade it.** No example, doc, or test constructs a Group transform. The single `transform` hit across all 34 example scenes is a code comment.
  - The transform-operation DSL was **never wired up**: its only test (`test/group.test.ts:69` "structure is defined by children") is `it.skip`, annotated "the ops→affine normalization was never implemented". It carries a `@ts-expect-error` because the ops-list input the test passes is not even accepted by the Group schema.
  - The renderer half is equally unfinished: `Sync.ts:316` carries a `ponytail:` marker stating a Group's 2D affine "is not yet threaded into child world coords" — the affine is honored only for **sized comps** (`syncComp`), never for plain containers.
  - **Consequence:** removing `TransformMatrix`/`TransformOperation` (task 6.5) deletes dead code, not a capability. No migration path is needed because nothing can be migrated. The skipped test is deleted rather than ported.
- [x] 1.4 Inventory every consumer of `Entity`, `Instance`, and trait exports across all packages, so section 8 can verify nothing was missed
  - **33 files**: motion/src 21 (8 core + 11 shapes + 3 particles), renderer/src 7, tests 5. `packages/react` has **zero** references — it only follows public types.
  - **Found an 11th entity the plan missed:** `ParticleField` (`Entity.make`, 744 lines under `src/particles/`, own renderer + animator + PRNG, exported as `Particles`, used by 6 example scenes and a test). Resolved as **scoped out** — see design D10.
  - **Surfaced and resolved:** `Square.ts` is a 16-line Rect variant. **Removed** — see design D11. Deleting it also removes its renderer (`Builtins.ts:274`), its `Shapes`/`all.ts` exports, and migrates 5 example scenes (`groups`, `camera-parallax` ×2, `the-box`, `camera-shake`) plus one MDX mention to `Rect` with equal width/height.
  - Full checklist in scratchpad `baseline/INVENTORY.md` — task 8.4 works through it.

## 2. Schema foundation

- [x] 2.1 Finalize `packages/motion/src/schemas.ts`: entity union, `EntityMap`, `EntityByTag`, `getEntityDefinitionByTag`, `Entry`. Field-set decisions from design D13: **drop** `Rect.rx`/`ry`; **restore** `Text.fillColor`, `Image.width`/`height` (optional/undefaulted, lone dimension ignored), and `Path`'s first-command-must-be-`M` filter; **keep** the sketch's `Ellipse.radiusX`/`radiusY` rename; **remove** `Group`'s `width`/`height`/`backgroundColor` (see 4.9)
- [x] 2.2 Add the shared mixins: `transformMixin` (`position`/`rotation` as `Vec3`) and an appearance mixin (`scale` as `Vec3` default `(1,1,1)`, `opacity` default `1`, `visible` default `true`), applied to every paintable member so no entity can omit or rename them
  - Verified by `test/schemas.test.ts`: every paintable entity carries position/rotation/scale/opacity/visible from the mixins.
- [x] 2.3 Give `Camera` `position` and `rotation` ONLY — no scale, opacity, or visible. It is the single non-paintable entity, already omitted from the frame's instance map (design D9)
  - Verified: Camera has position+rotation, and NOT scale/opacity/visible.
- [x] 2.4 Confirm `opacity` is present on every paintable member. The current code has it on every shape via `Shape2D.filled` or an explicit spread; the schema sketch dropped it, so this restores existing behavior uniformly rather than adding a field
  - Verified: all 9 paintable entities carry it; `TagsWith<"opacity">` excludes Camera (a `@ts-expect-error` proves `fade(camera)` will not compile).
- [x] 2.5 Make geometry relative to `position`: `Line.start`/`Line.end` as `Vec3` offsets (drop `x2`/`y2`/`z2`); add `position` to `Path` with commands as offsets from it
  - Verified: a Line spanning (50,20,300) keeps that span when moved to (100,100,100); a moved Path keeps its `commands` identical.
- [x] 2.6 Define `Instance<Tag>` with the phantom tag parameter (design D1) — `{ _tag, id, kind }`, one string-literal parameter, not the three-parameter generic
  - Verified: `{_tag,id,kind}` only; `isInstanceOf` compares tags; `DataOf<Instance<"Circle">>` narrows to Circle data (a `@ts-expect-error` proves `circle.text` is rejected).
- [x] 2.7 Confirm `Image` and `Text` still carry resource references as plain `{ _tag, id }` schema fields — resources are out of scope and must not be touched
  - Verified: both carry resource references as plain schema fields; `Resource.ts`/`Font.ts`/`Image.ts` untouched.
- [x] 2.8 Nothing consumes the new schema yet; `pnpm check` should be no worse than the 1.1 baseline
  - Confirmed: **exactly 15** TS errors, unchanged from the baseline — the new schema and its 14 tests add zero. Full suite 244 pass (was 230). Lint clean after `lint:fix`; added `!**/test/__baseline__` to `biome.json` so the 1.6 MB temporary baseline JSON stops tripping the file-size warning (revert with the harness at 8.6).

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
- [ ] 4.9 Stop `Scene.play` copying `scene.width`/`height`/`backgroundColor` onto its mount group (design D13) — it is the only writer of those fields, and a `Scene` has owned them since `Scene.ts:42`. The mount group becomes an ordinary group; the bounds must reach the renderer from the scene instead. **Pairs with 7.8 — do not land one without the other**
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
- [ ] 6.5 Remove `Group`'s `TransformMatrix`, `TransformOperation`, `identityTransform`, `multiplyTransforms`, and the transform-operation DSL. Dead code — nothing constructs it and the renderer never threaded it (1.3); also delete the `it.skip` ops-transform test in `group.test.ts`
- [ ] 6.7 Delete `Square` (design D11): `shapes/Square.ts`, its exports from `Shapes.ts`/`shapes/Shapes.ts`/`shapes/all.ts`, and its renderer + registry entry + union member in `Builtins.ts`
- [ ] 6.6 Grep for `~position`, `~opacity`, `~visible`, `$visible`, `~transform3d` across all packages — zero hits outside archived specs

## 7. Renderer

- [ ] 7.1 Change `Sync.ts` dispatch from `entry.entity.name` to `_tag` narrowing
- [ ] 7.2 Key the entity-renderer registry on the tag union so an unregistered entity fails the build rather than throwing at runtime
- [ ] 7.3 Delete `packages/renderer/src/FrameData.ts` and replace each reader with direct or narrowed field access
- [ ] 7.4 Update the `visible` read at the renderer seam — the rename from `~visible` is small and easily lost in a large diff (design D6)
- [ ] 7.5 Update Group/Hud handling to compose the uniform transform instead of consuming an affine matrix
- [ ] 7.6 Confirm `Hud` still dispatches distinctly from `Group`, placing its subtree in the screen-space tier
- [ ] 7.8 Replace the renderer's comp detection (design D13). Today `Sync.walk` infers a comp from `sizeOf(entry.data) !== null` — field presence on a Group. A comp is a render-to-texture boundary (own scene + render target + identity camera), and the audit found **no user-facing code creates one**: only `Scene.play` and one hand-built renderer test. So this is narrow — let `Scene.play` tell the renderer about the boundary it creates, carrying the bounds from the scene. **Do NOT introduce a general user-facing comp/clipping concept** — that is a separate change. **Pairs with 4.9.** Verify nested scenes still clip, size, composite opacity, and paint their background correctly
- [ ] 7.7 Let a `Hud`'s `position.z` flow into the HUD walk's accumulated offset, as world content already does (design D12). HUD content already renders through a real perspective `hudCamera` into `hudScene`, so z-ordering works via the existing z-buffer — no new sorting. **Verify a HUD example with no `z` set renders identically to before**, since 0 is what the old lens fabricated

## 8. Consumers and verification

- [ ] 8.1 Update `packages/react` public types
- [ ] 8.2 Port every `apps/docs/examples/*.scene.ts` to the new field vocabulary, including migrating the 5 `Shapes.Square` uses to `Rect` with equal width/height (D11). Required, not optional: `apps/docs` runs `tsc --noEmit` in `pnpm check`, so all 34 scenes must compile for the 8.5 gate. No shear-dependent scene exists (1.3). The 6 particles scenes (`particles`, `particle-field`, `snow`, `floating-motes`, `floating-field`, `camera-parallax`) must keep working unchanged — particles are scoped out (design D10)
- [ ] 8.3 MDX prose in `apps/docs/content/` (5 files reference entity/trait vocabulary): **do the minimum to keep the build green, no prose rewriting.** The docs site is slated for a full rewrite, so investing in wording here is throwaway. Fix only what breaks compilation or is actively wrong; leave stale phrasing for the rewrite
- [ ] 8.4 Work through the 1.4 inventory and confirm every consumer is ported
- [ ] 8.5 Run `pnpm check`, `pnpm test`, `pnpm lint` against the 1.1 baseline: test must stay at **0 failures**, lint at **0 errors**, and check must go **15 → 0**. The 15 pre-existing TS2352 errors are opaque-`{}` casts this change removes; a survivor is a finding, not an accepted baseline
- [ ] 8.6 Diff determinism against the 1.2 baseline; any per-frame value change other than a field rename is a regression to investigate, not to accept
- [ ] 8.7 Run `pnpm lint:fix`; confirm no non-null assertions and no biome-ignore suppressions were introduced (repo convention — use the `unreachable` helper)
- [ ] 8.8 Review the full diff for out-of-scope changes, especially to `Resource.ts`/`Font.ts`/`Image.ts` — resources must be untouched (design Non-Goals)

## 9. Specs

- [ ] 9.1 Sync the deltas: `openspec sync --change close-the-entity-world`
- [ ] 9.2 Confirm the `traits` capability is removed and its behavioral scenarios live in `entity-transform`
- [ ] 9.3 Confirm the resolved drifts: `instance-visibility` no longer specifies `$visible`, `object-depth` no longer requires `~transform3d`
- [ ] 9.4 Note the remaining known-stale `shapes` requirements (`Visible defaults` specifies black fills and SVG output; `Rect corner radii` references SVG semantics) — pre-existing drift, deliberately NOT fixed here; propose a separate cleanup change
- [ ] 9.5 Archive the change: `openspec archive close-the-entity-world`
