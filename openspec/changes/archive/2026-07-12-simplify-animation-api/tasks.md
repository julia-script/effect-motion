# Tasks: Simplify Animation API

## 1. Motion

- [x] 1.1 Rename `moveTo` → `tweenTo` and `move` → `tween` (public duals, docs); delete the public callback `tween`/`tweenTo`, keeping the interpolation engine internal (design D1/D2)

## 2. Consumers and verification

- [x] 2.1 Update tests (motion, random), playground, and demo for the new names; behavior assertions unchanged
- [x] 2.2 `pnpm check`, `pnpm lint`, `pnpm test` green; playground plays in the browser
