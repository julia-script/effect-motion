# Tasks: hud-layer

## 1. Entity + renderer

- [x] 1.1 `shapes/Hud.ts`: Group-shaped container (children, x/y offset, no z); export from `shapes/index.ts`; no-op paint fn + `builtinPaints` entry (the exhaustive map forces it).
- [x] 1.2 `Renderer.ts` flatten: effective camera per subtree (identity for Hud, memoized per frame), `hud` tag on paintables, world-nested-Hud loud defect naming the instance; hud-in-hud passes through as a Group.
- [x] 1.3 Two-tier sort (world by depth, then hud by depth, id tie-breaks) and CoC via each paintable's effective camera so HUD lands in sharp runs structurally.

## 2. Tests

- [x] 2.1 Framebuffer: HUD child renders at plain-2D position while the camera is dollied/rotated (world sibling moves, HUD doesn't); HUD paints over nearer world content; HUD sharp while `aperture > 0` blurs off-plane world content.
- [x] 2.2 Container semantics: Hud x/y offset moves the subtree (tweened via `moveTo`); hud-in-hud composes offsets; world-nested Hud dies with the named defect; deterministic order within the HUD tier.
- [x] 2.3 Sub-scene mounting: `Scene.play(scene, { parent: hud })` renders the sub-scene's instances as HUD content.

## 3. Docs

- [x] 3.1 `apps/docs/examples/hud.scene.ts` + registry: a camera dolly/shake over world content with a fixed HUD title and a sliding lower-third (Hud offset tween).
- [x] 3.2 Docs section (camera page, after depth of field, or composition page): the identity-camera model, top-tier paint order, screen-space offset, top-level placement rule, in-HUD z note.

## 4. Wrap up

- [x] 4.1 `pnpm lint:fix`; typecheck + tests across packages with no NEW failures (baseline: Schedule API, particles branding, export package); example verified in the browser. *(motion 235 pass + the 8 pre-existing; react clean. Example verified live via canvas readback: LIVE badge pixel-identical across samples while the camera dollied/shook the world; lower-third slid in; zero console errors.)*
- [x] 4.2 Sync check on the `motion-renderer` delta vs what shipped; stale-comment sweep.
