# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

effect-motion is a library for making motion graphics in code: deterministic, frame-exact scenes of schema-backed entities, composed with Effect. Scenes are pure functions of `(scene, settings)`; rendering is three.js/WebGPU via `@effect-motion/renderer` (browser playback and headless Node export). It is deliberately not a GUI editor and not a runtime UI-animation library. Direction lives in `roadmaps/project.md`.

**Read `AGENTS.md` first** — it is the binding API-conventions document (base/To animator pairs, the raw vs. semantic layers, trait lenses, dual call forms, determinism invariants). PRs that break those conventions need a design reason recorded in an openspec change.

## Commands

pnpm workspace + Turborepo. Run from the repo root:

- `pnpm build` — build all packages (`tsc` for libs, `next build` for docs)
- `pnpm test` — all tests (vitest)
- `pnpm check` — typecheck all packages (`tsc --noEmit`; depends on upstream builds)
- `pnpm lint` / `pnpm lint:fix` — Biome check / autofix
- `pnpm dev` — watch-build the libs and serve the docs site
- `pnpm docs` — docs site dev server only

Per-package (or `cd` into the package and drop the filter):

- `pnpm --filter effect-motion test` — core package tests
- `pnpm --filter effect-motion exec vitest run test/springs.test.ts` — single test file
- `pnpm --filter effect-motion exec vitest run -t "name"` — single test by name
- `pnpm --filter @effect-motion/react test` — React bindings tests

Note: `packages/react` tests alias `effect-motion` to `../motion/src` (see its `vitest.config.ts`), so they run without building the core. Typechecking (`pnpm check`) does require upstream `dist` output — Turbo handles that ordering.

## Workspace layout

- `packages/motion` — core library, published as `effect-motion`: scenes, entities, frame production. Renderer-free — no renderer dependency in its tree. Depends on `effect` (a pinned beta — an intentional pin, tracked in the roadmap's maintenance budget; upgrading effect can change seeded random sequences).
- `packages/three` — `@effect-motion/three`: bindings-only Effect wrapper over three.js (knows nothing about frames or entities). Browser entry plus `/node` entry (Dawn WebGPU + environment shims).
- `packages/renderer` — `@effect-motion/renderer`: the single frame renderer — the only place frames meet three. Retained scene graph, `build`/`update`/`dispose` entity contract, GPU DoF, browser canvas + Node PNG adapters.
- `packages/react` — `@effect-motion/react`: `usePlayer` hook (buffered streaming playback on a rAF clock) and the `Player` component.
- `apps/docs` — Fumadocs/Next.js docs site. Runnable examples live in `apps/docs/examples/*.scene.ts` and are registered in `examples/registry.ts` (the key doubles as the displayed source filename). MDX content in `content/docs/`.

## Core architecture (packages/motion)

A scene is authored as a generator (`Scene.make(function* () { ... })`) that instantiates entities and yields animation effects. The moving parts:

- **Entity / Instance** (`Entity.ts`, `Instance.ts`) — an Entity is a named effect/Schema struct plus optional trait lenses (`~position`, `~opacity`). `Scene.instantiate` creates a live Instance whose state the Runner owns. Instances are also Effects that resolve to themselves, which is what makes animator chains pipeable.
- **Runner** (`Runner.ts`) — Context.Service holding all instance state, the implicit `root` group, branch bookkeeping, and `Settings` (frameRate, width/height, backgroundColor, seed, maxFrames — default cap 36_000 frames; `Infinity` declares an intentionally infinite scene).
- **Phaser** (`Phaser.ts`) — the frame barrier. Concurrent animations each wait on the phaser per tick; `Scene.step`/`Scene.run` advance it one frame at a time. This is what makes frames deterministic regardless of concurrency.
- **Scene** (`Scene.ts`) — authoring (`make`, `instantiate`, `sleep`, `data`, `update`, `settings`) and composition combinators: `chain`, `all`, `stagger`, `fork` (branch with handle), `background`, `repeat`, `finish`. `Scene.run` produces the frame list; `Scene.stream` produces frames lazily (this is what the player consumes); `Scene.play` drives a renderer.
- **Animators** — `Motion.ts` (raw `tween`/`tweenTo` on numeric fields, semantic `move`/`moveTo`, `fade`/`fadeTo` via trait lenses, `wait`) and `Physics.ts` (`spring`/`springTo` — no duration; length emerges from the simulation, named presets in `Physics.springs`). Easings in `Timing.ts` (`timingFunctions` by name, or pass a function).
- **Rendering** — lives outside core in `@effect-motion/renderer` (see Workspace layout): a long-lived retained three scene diffs against each frame; occlusion is the GPU z-buffer; DoF is a per-pixel post chain bypassed at aperture 0. Core's `Projection.ts` keeps only pure camera resolution (`resolveCamera`) and point projection for tests.
- **Shapes** (`shapes/`) — Circle, Rect, Square, Ellipse, Line, Path, Text, Group. Standard trait lenses come from `Shape2D.positionLens()` / `opacityLens()`; write a custom lens only when semantics differ (Line translates both endpoints; Group carries its subtree).

Determinism invariants (from AGENTS.md — do not break): duration-based animations land the final frame exactly on target, springs snap on settle; no wall-clock or `Math.random()` in scenes (a seeded `Random` service is provided; default seed is the fixed string `"effect-motion"`); failures are loud defects naming the offender.

## OpenSpec workflow

The repo is spec-driven via the `openspec` CLI (skills in `.codex/skills/`):

- `openspec/specs/<capability>/spec.md` — current source of truth per capability.
- `openspec/changes/<change-name>/` — an in-flight change: `proposal.md` (what & why), `design.md` (how), `tasks.md` (steps), and `specs/` deltas. Archived to `openspec/changes/archive/` once shipped and synced.

Nontrivial features should go through a change (propose → apply → archive) rather than landing unspecified. Check `openspec/changes/` for active work before starting something that might overlap.

## Conventions

- Biome enforces formatting: tab indentation, double quotes, organized imports. Run `pnpm lint:fix` before committing.
- Never write code that breaks Biome rules — not even in tests. In particular, no non-null assertions (`!`) and no biome-ignore suppressions. Where a value is known present but typed nullable, use the `unreachable` helper (`packages/motion/test/support/raise.ts`, `packages/renderer/test/support/raise.ts`): `frames.at(-1) ?? unreachable()`.
- Stay type-safe. Casts (`as`) are an escape hatch for what TypeScript can't express (conditional return types, generic variance gaps) — use sparingly, and fix the signature before casting at the call site. See "Stay type-safe" in AGENTS.md.
- `ponytail:` comments are this repo's deferred-upgrade markers — a known ceiling plus its upgrade path (e.g. the player's unbounded frame buffer → ring buffer). Preserve them; add one when you consciously defer.
- Every animator ships as a base/To pair and as a dual (data-first `verb(instance, ...)` or pipeable `instance.pipe(verb(...))`); dispatch is by `Instance.isInstance` on the first argument, never arity. See AGENTS.md.
- Strict TypeScript throughout (`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` from `tsconfig.base.json`).
