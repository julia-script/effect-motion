# Tasks

## 1. Core and renderer

- [x] 1.1 Add finite defaulted radius and verify schema plus all four raw tween call forms with exact-target frame tests.
- [x] 1.2 Implement shared rounded contour and retained fill/outline integration; verify clamping, signed/zero dimensions, arc tangencies, bounded geometry, transforms, trim/dash composition, reuse and disposal with focused tests.

## 2. Author experience

- [x] 2.1 Document radius semantics, add a registered animated box-to-pill example and both package changesets; verify docs typecheck and visually inspect Node GPU example renders in ignored tmp/.

## 3. Integration and review

- [x] 3.1 Run affected package suites, dependency builds, motion/renderer/docs checks, focused Biome and strict OpenSpec validation; record results.
- [x] 3.2 Delegate one independent diff review, verify and fix credible findings, and commit on the isolated branch with an integration handoff.
