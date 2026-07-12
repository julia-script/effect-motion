# Add Tweening with Timing Functions

## Why

Motion currently interpolates linearly only — every animation moves at constant speed and feels mechanical. Real animation needs easing. Implementing the standard easing set (the classic easeIn/easeOut families plus back/elastic/bounce) gives `move`/`moveTo` and a new public `tween` expressive pacing with a familiar vocabulary.

## What Changes

- **New `src/Timing.ts`**: the standard timing functions — `linear`, `sin`, `cos`, the ease families `Sine`/`Quad`/`Cubic`/`Quart`/`Quint`/`Expo`/`Circ` × in/out/inOut, the parameterized factories `createEaseIn|Out|InOutBack`, `...Elastic`, `...Bounce`, and their default instances. Normalized signature `TimingFunction = (t: number) => number`.
- **Timing input is a name or a function**: `TimingInput = TimingFunctionName | TimingFunction` — the named registry gives autocompleted strings (`"easeInOutCubic"`); passing a custom function works everywhere a name does.
- **Public `Motion.tween` / `Motion.tweenTo`**: the generalized lerp as a callback-driven pair mirroring `move`/`moveTo` — `tween(from, to, duration, fn, timing?)` takes explicit origin and destination records (no instance needed); `tweenTo(instance, to, duration, fn, timing?)` reads the origin from the instance's current data and is dual/pipeable. One eased step per frame, last frame exactly at `to`.
- **`Motion.moveTo` / `Motion.move` accept an optional trailing `timing`** (default `"linear"`). Because the trailing arg makes call arity variable, dual dispatch switches from arity counting to a first-argument predicate — new `Instance.isInstance` guard.
- Playground demos contrasting easings side by side.
- Hygiene: `tsconfig.tsbuildinfo` untracked and gitignored.

## Capabilities

### New Capabilities

- `tweening`: The timing-function library, the name-or-function timing input, per-frame eased interpolation (`tween`), and timing support on the motion combinators.

### Modified Capabilities

<!-- none — phaser, shapes, svg-rendering unchanged; the motion module has no prior spec -->

## Impact

- New `src/Timing.ts`; `src/Motion.ts` (tween public, timing threading, predicate dual); `src/Instance.ts` (`isInstance`); `src/index.ts` (export `Timing`).
- `playground/main.ts` easing showcase; new `test/timing.test.ts` + Motion timing tests.
- `.gitignore` + untrack `tsconfig.tsbuildinfo`. No dependency changes.
