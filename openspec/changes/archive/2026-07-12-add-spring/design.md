# Design: Add Spring Animation

## Context

The tweening capability (specs/tweening) provides duration-based interpolation: `tween`/`tweenTo` (callback) and `move`/`moveTo` (instance-applying), all paced by timing functions over a fixed frame count. Springs are the durationless counterpart: a classic damped harmonic oscillator simulated until it settles. The scene clock is discrete (Runner `frameRate`, one `Scene.tick` per frame), and `Motion` combinators dual-dispatch on `Instance.isInstance`.

## Goals / Non-Goals

**Goals:**
- Physically simulated motion that carries momentum and ends on its own.
- Presets by name with the same ergonomics as timing functions (`"plop"` autocompletes; a `Spring` object works anywhere a name does).
- Frame-rate independence: the same spring settles to the same trajectory at 30 or 60 fps.
- Family consistency: `spring`/`springTo` mirror `tween`/`moveTo` conventions (explicit vs current origin, callback vs instance application, dual data-last forms).

**Non-Goals:**
- Springs as `TimingInput` — no duration exists to normalize; keep the type honest.
- Velocity handoff between consecutive animations (interrupting a spring mid-flight and inheriting its velocity) — needs per-instance velocity state; later.
- `spring`-with-explicit-origin applying to instances (a "springMove") — add if real scenes want it.
- Configurable simulation rate — 120 Hz is fixed internal detail.

## Decisions

### D1: Physics — damped harmonic oscillator, per key
`force = -stiffness · (position - target) - damping · velocity`; `velocity += (force / mass) · dt`; `position += velocity · dt`. For records, each key runs its own position/velocity under shared params; the animation settles when EVERY key satisfies |target − position| < tolerance AND |velocity| < tolerance. Settling snaps all keys exactly onto the target (physics alone would only approach it).

### D2: Fixed 120 Hz substeps inside scene frames
Each scene frame advances the simulation by `1 / frameRate` seconds, consumed in fixed `1/120` s substeps (plus a remainder step), with the settle check after every substep. Rationale: explicit-Euler integration diverges with large `dt` (stiff springs at low frame rates would explode); a fixed substep makes trajectories effectively frame-rate independent and matches the frame-exact spirit of the rest of Motion. 120 Hz = 2 substeps per frame at 60 fps.

### D3: `Spring` config + presets, name-or-value input
`interface Spring { mass; stiffness; damping; initialVelocity? }` with validation as defects (mass > 0, stiffness ≥ 0, damping ≥ 0 — a non-positive mass is a programming error, not a recoverable condition). Preset registry `springs = { beat, plop, bounce, swing, jump, strike, smooth }` (canonical constants, e.g. plop = mass 0.2 / stiffness 20 / damping 0.68); `SpringName = keyof typeof springs`; `SpringInput = SpringName | Spring`; `resolve` mirrors `Timing.resolve` (function… here object-passthrough, defect on unknown name). Default when omitted: `{ mass: 0.05, stiffness: 10, damping: 0.5 }` — a fast, gently damped general-purpose spring, exported as `defaultSpring`.

### D4: API surface — a `Physics` namespace, spring in the duration slot
Physics-based motion gets its own namespace: durationless, momentum-carrying combinators read differently enough from tweens that the split belongs in the import (`Physics.springTo` vs `Motion.moveTo`).
- `Physics.spring(from, to, springInput, fn, settleTolerance?)`: records + callback, explicit origin (the `tween` analog — third argument is "how it moves": duration+timing there, spring here).
- `Physics.springTo(instance, to, springInput?, settleTolerance?)`: dual/pipeable, origin from current data, applies via `Scene.update`, resolves with the instance (the `moveTo` analog). Predicate dispatch (`Instance.isInstance`) as with the existing duals.
Rejected: overloading `moveTo`'s timing with springs — types get dishonest (duration would be dead) and the no-duration semantics deserve a distinct name.

### D5: Termination semantics
Settle tolerance defaults to 0.001 (absolute, same units as the values). A zero-damping (or extremely low) spring may never settle: the animation runs indefinitely — each iteration still ticks the scene, so the phaser keeps stepping normally and nothing deadlocks; the scene just never finishes. Documented, not guarded: capping would silently corrupt intentional perpetual motion. `initialVelocity` lets presets like `jump` (v₀ = 8) start with momentum.

### D6: Placement — one `Physics` module
Everything spring lives in `src/Physics.ts`: the `Spring` interface, presets, `resolve`, validation, the simulation engine, and both combinators — one import for consumers (`Physics.springs.plop`, `Physics.springTo`). `Motion.ts` exports its `Target` type and target-resolution helpers so Physics reuses them instead of duplicating (Physics depends on Motion's plumbing, never the reverse). The tweening capability spec absorbs the new requirements — springs are part of the same animation domain, not a new capability.

## Risks / Trade-offs

- [Explicit Euler still degrades for extreme params (huge stiffness, tiny mass)] → 120 Hz substeps handle all preset-scale params; document that extreme custom configs may need taste, not that they're supported.
- [Per-key settling couples keys (slowest key holds all)] → Correct behavior for coupled motion (x/y arrive together); per-key independence would tear positions apart.
- [Unbounded animation length surprises stream consumers] → `Scene.stream` ends on scene completion as always; a never-settling spring is visible and intentional (D5).

## Open Questions

- None blocking. Velocity handoff (Non-Goals) is the natural follow-up once springs see real use.
