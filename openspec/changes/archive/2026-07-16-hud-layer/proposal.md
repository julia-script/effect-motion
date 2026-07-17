# HUD layer: screen-space subtrees via the identity camera

## Why

Every paintable projects through the active camera, so there is no way to author screen-space content — titles, lower thirds, watermarks, counters — that stays bolted to the glass while the camera dollies, shakes, or racks focus. This is the missing complement to the camera work (3D projection, movements, depth of field): AE's "2D layer" concept, requested as HUD.

## What Changes

- **`Shapes.Hud` container entity**: a Group variant whose subtree is projected through **`Camera.identity(width)` instead of the active camera**. That one substitution buys the whole feature: positioning/scale/depth semantics inside the HUD work unchanged but are camera-independent; camera shake/dolly/rack immunity is definitional, not an exemption list; and depth-of-field exemption falls out structurally — the identity camera's `aperture` is 0, so HUD content is sharp through the existing CoC path with no special rule.
- **Two-tier paint order**: HUD paintables always draw on top of world content. The renderer's sort becomes world-by-depth, then HUD-by-depth (stable id tie-breaks in both tiers). Multiple Hud containers compose in the top tier.
- **Hud offset is screen-space and tweenable**: like Group, a Hud contributes its `x`/`y` to its children — sliding a whole lower-third in is one `moveTo` on the container.
- **Placement rules**: a Hud nested inside world content is a loud defect (offset/camera semantics would be incoherent); a Hud inside a Hud is a harmless no-op (already identity). Whole sub-scenes mount into a Hud via the existing `Scene.play(scene, { parent: hud })` — no new mount API.
- **Docs**: an example pairing a camera movement (dolly + shake) with a fixed HUD title/watermark, and a docs section.
- Explicitly not included: anchoring/safe-area helpers (x/y math at authoring time; comp dimensions are constants), any thorvg package change (pure motion-renderer territory), and a spike (no new engine interaction — projection/sort logic over existing paint paths, fully assertable in framebuffer tests).

## Capabilities

### New Capabilities

- `hud-layer`: the Hud container, identity-camera subtree projection, top-tier paint order, screen-space offset, placement rules, and the DoF/camera-immunity guarantees.

### Modified Capabilities

- `motion-renderer`: the "Frame pipeline preserved" requirement — projection is through the frame's camera *for world content* and the identity camera for Hud subtrees; paint order becomes the two-tier sort.

## Impact

- `packages/motion`: `shapes/Hud.ts` (Group-shaped container), `Renderer.ts` flatten (per-subtree camera + hud tag + nested-in-world defect) and the two-tier sort, `render/shapes.ts` (Hud paints nothing — the Group no-op — plus the `builtinPaints` entry the exhaustive map forces).
- `packages/thorvg`, `packages/react`: no changes.
- `apps/docs`: example + content section (camera page or composition page).
- Tests: framebuffer — HUD stays put under a moved/rotated camera; paints on top of nearer world content; stays sharp under `aperture > 0` while world content blurs; Hud offset tweens; nested-in-world defect; hud-in-hud no-op. Determinism (stable order) inherited from existing invariants.
- No dependency changes; no determinism impact (identity camera is pure frame data).
