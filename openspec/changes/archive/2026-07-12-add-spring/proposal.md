# Add Spring Animation

## Why

Tweens need a duration up front; springs don't — they simulate physics (a damped harmonic oscillator) and run until the value settles, which gives natural, momentum-carrying motion that duration-based easing can't fake. A spring is not a timing function (there is no fixed duration to normalize progress against), so it needs its own combinator pair rather than a `TimingInput`.

## What Changes

- **New `src/Physics.ts`** — a new namespace for physics-based motion, separate from the duration-based `Motion`: `Spring` config (`mass`, `stiffness`, `damping`, `initialVelocity?`, all validated — mass > 0, stiffness ≥ 0, damping ≥ 0), a preset registry (`beat`, `plop`, `bounce`, `swing`, `jump`, `strike`, `smooth`), and `SpringInput = SpringName | Spring` mirroring the timing name-or-value pattern.
- **Physics**: Hooke's-law integration (`force = -stiffness · displacement - damping · velocity`) at a fixed 120 Hz substep inside each scene frame, so behavior is independent of the runner's frame rate. The animation ends when displacement AND velocity are both within a settle tolerance (default 0.001), then snaps exactly onto the target.
- **`Physics.spring` / `Physics.springTo`**, mirroring the `Motion` family pattern:
  - `spring(from, to, springInput, fn, settleTolerance?)` — explicit origin records, values to a callback (the `tween` analog; the spring sits in the duration's slot).
  - `springTo(instance, to, springInput?, settleTolerance?)` — origin and application on the instance (the `moveTo` analog), dual/pipeable, resolving with the instance. Default spring: `{ mass: 0.05, stiffness: 10, damping: 0.5 }`.
- Records animate per-key: each key gets its own position/velocity under shared spring params; the spring settles when every key has.
- Playground: springy interactions (a plop-in entrance, a swing) next to the easing race.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `tweening`: gains spring requirements (pure additions — spring configuration and presets, physics/settling semantics, and the spring combinator pair). Existing requirements unchanged.

## Impact

- New `src/Physics.ts` (config, presets, engine, combinators — one module, one import); `src/index.ts` (export `Physics`); `src/Motion.ts` only exports its target-resolution helpers for reuse.
- New `test/physics.test.ts`; `playground/main.ts` additions.
- No dependency changes. Note: a zero-damping spring never settles — documented behavior, the scene simply keeps animating (each frame still ticks, so stepping never deadlocks).
