## Context

Three packages publish to npm at `0.1.0`: `effect-motion` (core), `@effect-motion/react` (Player/usePlayer), `@effect-motion/export` (Node-only PNG/MP4 export). None has a README, so their npm pages are blank. Long-form docs already live at the docs site (`apps/docs`), which is the canonical reference. `effect` is now a peer dependency (`>=4.0.0-beta.94`) of all three, so install instructions must include it explicitly.

## Goals / Non-Goals

**Goals:**
- Each published package has a concise README that renders as a usable npm landing page.
- Install sections name `effect` alongside the package (peer dep must be installed by the consumer).
- Examples use the packages' real public API, verified against `src/index.ts` and the getting-started doc.

**Non-Goals:**
- No duplication of full docs — READMEs link to the docs site rather than restating it.
- No changes to code, dependencies, build config, or `package.json` (`README.md` is auto-included by npm).
- No root-repo README rework; this change is scoped to the three published packages.

## Decisions

- **One README per package, not a shared/symlinked file.** Each package's README differs (core = authoring a scene; react = playing it; export = rasterizing to PNG/MP4). npm resolves each package's own `README.md`; a symlink would not survive `pnpm pack` reliably. Trade-off: three files to keep in sync, mitigated by keeping shared framing (determinism, effect peer dep) to one or two lines each and linking out for the rest.
- **Reuse the getting-started example verbatim for the core + react READMEs.** It is already the maintained, working example. Keeps the README example and the docs from drifting.
- **Install command includes `effect`.** Since effect is a peer dep, `pnpm add <pkg>` alone would emit a peer warning. Each README shows `pnpm add <pkg> effect`.

## Risks / Trade-offs

- [README examples drift from the API as it evolves] → Examples mirror the getting-started doc and use only top-level exports; the spec adds a scenario asserting example imports resolve against package exports, so a review pass catches drift.
- [Three files duplicate framing] → Keep per-package prose minimal; link to docs for depth.

## Migration Plan

Additive only — new files, no existing behavior touched. No rollback concern; deleting the READMEs reverts to the prior blank-page state.
