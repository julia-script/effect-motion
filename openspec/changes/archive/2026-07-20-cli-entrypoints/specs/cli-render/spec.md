# cli-render Specification (delta)

## REMOVED Requirements

### Requirement: Render targets from config
**Reason**: The config file is removed; there are no targets. Rendering is an ordinary program in `render.ts` — multiple outputs are multiple `Video.render` calls in code, and orchestration/summaries belong to the program, not the CLI.
**Migration**: Move each target to a `Video.render(scene, "<output>/<name>.mp4", { settings })` call in `render.ts`, providing loader layers with `Effect.provide`.

### Requirement: Flag overrides with tsc-style precedence
**Reason**: Code is the config — one source of truth, aligned with the determinism story. A render.ts wanting knobs reads its own `process.argv`.
**Migration**: Encode former flag values (`fps`, `seed`, `dpr`, `frames`, output paths) directly in `render.ts`.

### Requirement: Configless direct scene rendering
**Reason**: Subsumed — every render is now "configless"; the entrypoint file replaces both the config and the direct-scene mode.
**Migration**: `motion render ./my-render.ts` (or the default `./render.ts`).

## ADDED Requirements

### Requirement: Render entrypoint execution
`motion render [file]` SHALL load the entrypoint (default `./render.ts` relative to the working directory) through the same Vite-based pipeline the studio uses, provide the Node platform services (including `ChildProcessSpawner`), run the module's default-exported Effect, and exit 0 on success. A missing entrypoint SHALL exit non-zero naming the expected path; a missing or non-Effect default export SHALL exit non-zero naming the file and the problem; a failing effect SHALL render through the CLI's error path (message, not stack trace) and exit non-zero. The entrypoint SHALL also be runnable without the CLI by self-providing the platform services (documented contract).

#### Scenario: Default entrypoint renders
- **WHEN** `motion render` runs in a project whose `render.ts` default-exports a `Video.render(...)` effect with its loader layers provided
- **THEN** the output file exists and the exit code is 0

#### Scenario: Explicit entrypoint file
- **WHEN** `motion render ./exports/teaser.render.ts` runs
- **THEN** that module's effect executes instead of `./render.ts`

#### Scenario: Missing entrypoint names the path
- **WHEN** `motion render` runs in a directory with no `render.ts`
- **THEN** the command exits non-zero with an error naming `./render.ts` and hinting at the expected contract

#### Scenario: Loader coverage is checked at authoring, not at run
- **WHEN** a render.ts calls `Video.render` on a scene requiring `FontLoader<"Pacifico">` without providing it
- **THEN** the file itself fails to typecheck (`Video.render`'s requirements), before any CLI invocation

## MODIFIED Requirements

### Requirement: dpr maps to supersampled export
A render entrypoint passing `dpr` in `Video.render`'s options SHALL get the export pipeline's supersampling: output pixel dimensions are the scene dimensions × dpr while authored coordinates are unchanged. (Unchanged behavior; the former config/flag sources are gone — `dpr` is a code-level option only.)

#### Scenario: dpr doubles pixel dimensions
- **WHEN** a 960×540 scene renders with `{ dpr: 2 }`
- **THEN** the output video is 1920×1080
