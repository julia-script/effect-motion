# video-encoding Specification (delta)

## ADDED Requirements

### Requirement: A render program is runnable with documented platform provision
`@effect-motion/export` SHALL document (and verify by test) the standalone-run contract for a render entrypoint: `Video.render`'s only leftover platform requirement is the process spawner, satisfiable by providing the Node platform services (e.g. `NodeServices` from `@effect/platform-node`), so a `render.ts` is executable directly (e.g. via `tsx`) without the CLI. The scene's resource loaders remain the caller's requirement, provided in the same pipe. `Video.render` SHALL create the output path's parent directory (recursively) before encoding, so render programs carry no mkdir boilerplate.

#### Scenario: Standalone render.ts runs without the CLI
- **WHEN** a render program pipes `Video.render(...)` through `Effect.provide` of its loader layers and the Node platform services and is executed directly
- **THEN** the output video is produced identically to running it through `motion render`

#### Scenario: Output directory is created
- **WHEN** `Video.render(scene, "fresh/dir/out.mp4")` runs and `fresh/dir` does not exist
- **THEN** the directory is created and the video is written
