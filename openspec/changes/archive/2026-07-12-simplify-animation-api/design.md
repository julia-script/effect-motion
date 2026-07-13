# Design: Simplify Animation API

## Context

Motion currently exports `move`/`moveTo` (instance-applying, explicit/current origin) and `tween`/`tweenTo` (callback-driven); all share one internal eased engine and predicate-based dual dispatch on `Instance.isInstance`. The follow-up change (add-entity-traits) introduces the semantic layer (`move`/`moveTo`, `fade`/`fadeTo`, trait-based `spring`/`springTo`) and needs the `move*` names free.

## Goals / Non-Goals

**Goals:**
- One convention in Motion: animators apply to the instance; explicit-vs-current origin is the only axis.
- Free `move`/`moveTo` for the semantic layer.
- Keep `tween`/`tweenTo` as the raw fallback for arbitrary numeric props (fields with no trait: `radius`, `width`, custom entity fields).

**Non-Goals:**
- The trait layer and all Physics reshaping (add-entity-traits).
- Any behavior change to interpolation or timing — pure API reshaping.

## Decisions

### D1: Renames, not redesigns
Current `moveTo` becomes `tweenTo`; current `move` becomes `tween` — identical signatures, duals, timing handling, and frame-exactness. The internal callback engine keeps its current shape (it's what everything compiles down to); only its public exports disappear.

### D2: Callback forms deleted without replacement
No scenario surfaced where the callback adds value over direct application; the coming trait helpers cover the derived-semantics cases better. Deleting now, before external users exist, is the cheapest it will ever be. The engine remains one `export` away if a real need appears.

### D3: Naming semantics going forward
"tween" = mechanism on raw props by field name; "move"/"fade"/"spring" (next change) = meaning via the entity's own trait lenses. This change owns the mechanism layer; add-entity-traits owns the meaning layer, including Physics.

## Risks / Trade-offs

- [Breaking renames ripple through every consumer] → All in-repo; mechanical find/replace verified by the full suite.
- [Someone eventually needs a per-frame callback] → The engine is internal, not gone; re-exporting is a one-line decision recorded here as the escape hatch.

## Open Questions

- None blocking.
