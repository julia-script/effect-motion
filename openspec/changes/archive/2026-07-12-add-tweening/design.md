# Design: Add Tweening with Timing Functions

## Context

`Motion` has a private `lerp` (per-frame linear interpolation, last frame exactly at the target, min one frame) shared by `moveTo` (from current data) and `move` (explicit start), both dual-dispatched via `Function.dual(arity, ...)`. The timing functions are the classic easing equations (the easeIn/Out/InOut families known from easings.net, plus parameterized back/elastic/bounce curves).

## Goals / Non-Goals

**Goals:**
- The full standard timing-function set, usable by name (autocompleted string) or as a plain function.
- Easing on `tween` (public), `moveTo`, and `move`; default remains linear.
- Frame-exactness preserved: last frame lands exactly on the target for any easing with f(1) = 1.

**Non-Goals:**
- Spring/physics-based timing (no fixed duration) — different primitive, later.
- Per-key timing (one easing per animated prop) — one timing per call for now.
- Composition helpers (reverse, mirror, chained easings) — trivial to add later as functions.

## Decisions

### D1: Normalized to `(t: number) => number`
Every timing function maps progress to eased progress with the single signature `TimingFunction = (t: number) => number` — value mapping into actual ranges is `tween`'s job, not the easing's. Parameterized factories (`createEaseInBack(s)`, `createEaseOutBounce(n, d)`, ...) keep their shape parameters and return `TimingFunction`; the exported defaults are the factories applied with canonical constants (back overshoot 1.70158, bounce 7.5625/2.75, ...). `sin`/`cos` are included as periodic helpers over one cycle.

### D2: Named registry + union input
`const timingFunctions = { linear, easeInSine, ... }` (default factory instances included: `easeInBack`, `easeOutElastic`, ...); `type TimingFunctionName = keyof typeof timingFunctions`; `type TimingInput = TimingFunctionName | TimingFunction`; `resolve(input)` returns the function, dying (defect) on an unknown name — TS makes that unreachable for typed consumers, the runtime check catches plain-JS typos. Rejected: only exporting functions without the registry (loses string ergonomics the user asked for).

### D3: Optional trailing `timing` forces predicate-based dual
`moveTo(instance, to, duration, timing?)` is 3 or 4 args; the data-last form is 2 or 3 — arity counting can no longer disambiguate (a 3-arg call is either form). `Function.dual` accepts a predicate: dispatch on `Instance.isInstance(args[0])` (new guard in Instance.ts checking the `~motion/Instance` TypeId). This is the standard effect pattern for optional-arg duals.

### D4: `tween` / `tweenTo` — callback pair mirroring `move` / `moveTo`
The origin convention is uniform across both pairs: the base form takes an explicit origin, the `To` form reads it from the instance's current data.
- `tween(from, to, duration, fn, timing?)` — pure records, no instance: eased `t` per frame (`f(i / frames)`), `fn` called with the interpolated record, `Scene.tick` per step. The private `lerp` generalized and made public; `lerp` disappears as a separate entity (`tween` with default `"linear"` is it).
- `tweenTo(instance, to, duration, fn, timing?)` — origin = the instance's current data at the keys of `to`; values go to `fn` (the caller applies them), and it resolves with the instance. Dual: data-first or `instance.pipe(tweenTo(to, duration, fn, timing?))` (predicate dispatch, D3).
- `moveTo`/`move` are the "apply to the instance" specializations of the same engine: one internal drives all four, with `Scene.update` as the built-in applier and `timing` threaded straight through.

### D5: Overshoot is legal
Back/Elastic ease outside [0, 1] mid-animation; interpolation must extrapolate, not clamp (the existing `from + (to - from) * t` already does). Only the endpoint matters: every non-periodic easing satisfies f(1) = 1, so the final frame is exact. `sin`/`cos` deliberately do NOT end at 1 (periodic) — documented; using them in `moveTo` leaves the value where the cycle ends (`f(1)` = start), which is correct for loops and surprising-but-honest otherwise.

### D6: Naming — `Timing.ts` next to `Time.ts`
`Time.ts` (durations → frames) and `Timing.ts` (easing curves) are adjacent names for related-but-different things; kept because both match their domain vocabulary (the user-facing param is `timing`). Revisit only if it confuses in practice.

## Risks / Trade-offs

- [Easing math errors] → Tests assert f(0) = 0 and f(1) = 1 for every named easing, plus known midpoint values (e.g. easeInQuad(0.5) = 0.25) and factory parameter effects.
- [`sin`/`cos` in the registry let `moveTo(..., "sin")` end away from the target] → Documented in D5; they exist for `tween`-driven periodic effects. Acceptable over special-casing the registry.
- [Predicate dual is marginally slower than arity check] → Negligible: one TypeId property check per call.

## Open Questions

- None blocking.
