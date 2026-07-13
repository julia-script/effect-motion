# Simplify Animation API

## Why

The animation surface grew a 2×2 (apply-vs-callback × explicit-vs-current origin) whose callback half has no real use: nothing in the demo, playground, or tests does anything with the callback that direct application couldn't. Meanwhile the `move*` names are wanted for the coming trait-based semantic layer (add-entity-traits). Collapse Motion to one rule — **animators apply to the instance; the only axis is explicit vs current origin** — and free the `move` vocabulary.

## What Changes

- **BREAKING — Motion renames**: `moveTo` → `tweenTo` (current-data origin), `move` → `tween` (explicit origin). Signatures, dual/pipeable forms, and timing parameters unchanged. These remain the *raw* layer: arbitrary numeric props by field name.
- **BREAKING — callback forms deleted**: the callback-based `Motion.tween(from, to, duration, fn, timing?)` and `Motion.tweenTo(instance, to, duration, fn, timing?)` are removed from the public API. The per-frame interpolation engine survives as the private internal it always was.
- Physics is deliberately untouched here — `spring`/`springTo` are reshaped into trait-based helpers by add-entity-traits, which owns the whole semantic layer.
- Consumers (tests, playground, demo) updated mechanically; the `tweening` spec's two affected requirements rewritten.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `tweening`: "Eased per-frame tweening" (tween/tweenTo become the instance-applying pair) and "Timing on motion combinators" (renames) rewritten. Timing library, spring physics, and spring combinator requirements unchanged (the latter changes in add-entity-traits).

## Impact

- `src/Motion.ts` only; tests and playground updated for the renames.
- After this change plus add-entity-traits: raw layer `tween`/`tweenTo`; semantic layer `move`/`moveTo`, `fade`/`fadeTo`, `spring`/`springTo`.
