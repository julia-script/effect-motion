# Design: hud-layer

## Context

The renderer flattens the instance tree (accumulating ancestor translations), projects each leaf through `frame.camera`, depth-sorts far→near, and paints into DoF blur buckets (camera-depth-of-field, shipped). `Camera.identity(width)` already exists and now carries `focusDistance`/`aperture: 0`. Group containers contribute x/y/z offsets and paint nothing; `Scene.play(scene, { parent })` mounts sub-scenes into any container via the ambient-parent reference.

## Goals / Non-Goals

**Goals:**

- Screen-space content that ignores the active camera entirely — position, shake, zoom, focus.
- Always on top of world content; ordinary animators drive HUD elements and the container itself.
- Zero new projection or paint machinery; no thorvg changes.

**Non-Goals:**

- Anchoring/safe-area helpers (corner pinning, margins) — authoring-time x/y arithmetic; comp size is a constant.
- Per-instance screen-space flags (the container is the unit of HUD-ness).
- Any change to how the player or exporters consume frames.

## Decisions

### D1: Hud is a Group variant projected through the identity camera

`Shapes.Hud` has Group's shape (children + x/y offset; no z — see D3). During flatten, entering a Hud switches the *effective camera* for the subtree to `Camera.identity(frame.width)`. Everything downstream is unchanged code: projection, billboard affines, per-element depth inside the HUD, and — decisively — depth of field: the identity camera's `aperture` is 0, so the existing CoC path yields sigma 0 for every HUD paintable. No "skip blur for HUD" rule exists to maintain.

*Alternatives considered:* an identity-affine bypass (skip projection for HUD) — less code reuse, loses deliberate in-HUD depth, and needs its own DoF exemption; a second implicit root with a new mount API — more machinery (new frame field, Runner root, API) for what one top-level container already does; a per-instance flag — schema churn on every entity and incoherent mixed subtrees.

### D2: Two-tier sort

Flatten tags paintables `hud: boolean`. Sort: all world paintables by depth (id tie-break), then all HUD paintables by depth (id tie-break). HUD therefore paints over any world content, including content nearer than the HUD's own projected depth — that is the definition of a HUD. The DoF bucket walk operates on the combined list; HUD paintables quantize to sigma 0 (identity camera) and land in sharp runs naturally — no bucket-loop change beyond using each paintable's effective camera for CoC.

### D3: Hud contributes a screen-space x/y offset; no z on the container

Like Group, the Hud's `x`/`y` compose into its children — in screen coordinates, since the subtree projects through the identity camera. One `moveTo` on the container slides an entire lower-third in or out. The container carries no `z` (its subtree's stacking against other Hud containers comes from the children's own z / id tie-break); a container z would suggest world-depth semantics HUD deliberately doesn't have.

### D4: Placement rules are loud

A Hud whose ancestors include any non-root container is a defect naming the instance ("Hud must be a top-level child of the root: nested HUD would compose world offsets into screen coordinates"). Detection is free during flatten (the recursion knows its path). A Hud inside a Hud is silently allowed and meaningless (already identity, offsets compose) — not worth a rule. Rationale: matching the repo's loud-defect invariant beats documenting a footgun; and the restriction is easy to lift later if a real use case appears (a spec change, not a break).

### D5: Sub-scene mounting needs no new API

`Scene.play(lowerThird, { parent: hud })` already mounts a scene's instances under any container. The docs example demonstrates this composition (a self-contained lower-third scene mounted into the HUD).

## Risks / Trade-offs

- [HUD content at z far from 0 perspective-scales through the identity camera] → Intentional (in-HUD depth is a feature — subtle parallax between HUD elements); z defaults to 0, so naive usage is flat. Documented.
- [Top-level-only restriction surprises someone composing groups of Huds] → Loud defect names the instance and the rule; lifting it later is additive.
- [Two-tier sort touches the hottest loop] → It's one boolean partition on the existing sort; determinism preserved by the same id tie-break, asserted by tests.
- [Text estimated-box workaround inside HUD] → Text under identity camera takes scale 1 — exactly its best-behaved path; nothing new.

## Open Questions

- None blocking. No spike: no new engine interaction (projection/sort only; paint fns and thorvg untouched).
