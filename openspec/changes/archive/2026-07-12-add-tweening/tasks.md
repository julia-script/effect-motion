# Tasks: Add Tweening with Timing Functions

## 1. Timing functions (new src/Timing.ts)

- [x] 1.1 Implement the standard easing set normalized to `(t: number) => number` (design D1): linear, sin, cos, easeIn/Out/InOut × Sine/Quad/Cubic/Quart/Quint/Expo/Circ, createEaseIn/Out/InOutBack(s), ...Elastic(s), ...Bounce(n, d) + default instances with canonical constants
- [x] 1.2 Registry + types (design D2): `timingFunctions` record, `TimingFunctionName`, `TimingInput`, `resolve(input)` (defect on unknown name)
- [x] 1.3 Export `Timing` from src/index.ts

## 2. Motion integration

- [x] 2.1 `Instance.isInstance` guard (TypeId check) in src/Instance.ts
- [x] 2.2 Rename internal lerp to `tween`, add `timing` param (eased t per frame, extrapolating interpolation), export publicly as `Motion.tween(from, to, duration, fn, timing?)`; add dual/pipeable `Motion.tweenTo(instance, to, duration, fn, timing?)` reading the origin from current data and resolving with the instance (design D4/D5)
- [x] 2.3 Thread optional trailing `timing` through `animate`, `moveTo`, `move`; switch both duals to predicate dispatch on `Instance.isInstance(args[0])` (design D3)

## 3. Tests

- [x] 3.1 test/timing.test.ts: f(0)=0 and f(1)=1 for every non-periodic named easing; known midpoints (easeInQuad(0.5)=0.25, easeInOutQuad(0.5)=0.5); factory params change the curve; resolve by name / passthrough function / unknown-name defect
- [x] 3.2 Motion timing tests: same tween linear vs easeInQuad differs mid, identical exact final frame; easeOutBack overshoots then lands exactly; tweenTo derives origin from current data (both call forms); moveTo/move accept timing in data-first AND data-last forms; omitted timing = linear
- [x] 3.3 Existing tests stay green (untouched behavior when timing omitted)

## 4. Playground + hygiene

- [x] 4.1 Playground: same move with contrasting easings (e.g. two shapes racing: linear vs easeInOutCubic; a bounce drop)
- [x] 4.2 Add tsconfig.tsbuildinfo to .gitignore and untrack it

## 5. Verify

- [x] 5.1 `pnpm check`, `pnpm lint`, `pnpm test` green; headless frame-exact verification of eased moves; playground plays in the browser
