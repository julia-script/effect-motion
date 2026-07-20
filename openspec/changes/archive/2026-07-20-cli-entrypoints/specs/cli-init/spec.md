# cli-init Specification (delta)

## MODIFIED Requirements

### Requirement: Generated project structure
The scaffold SHALL produce: `src/scenes/hello-world.ts` (a simple working NAMED scene exporting `scene`), `src/main.ts` (an ordinary scene composing the scene modules via scene combinators — not a CLI-special file), `src/assets/` (empty, kept), `studio.ts` (a `studioConfig` registering the hello and main scenes), `render.ts` (a program default-exporting a `Video.render` effect writing to `./output`), `package.json`, `tsconfig.json` (strict, matching the library's supported settings), an `AGENTS.md` teaching AI coding agents the project's authoring model (scene structure, animator conventions, determinism rules, the two entrypoint contracts), and a `.gitignore` covering `node_modules/` and `output/`. There SHALL be no `motion.config.ts`. The generated project SHALL render and preview successfully with no edits.

#### Scenario: Fresh scaffold works end to end
- **WHEN** a scaffolded project runs `motion render` after install
- **THEN** an MP4 appears under `output/` with exit code 0

#### Scenario: Fresh scaffold previews
- **WHEN** a scaffolded project runs `motion studio` and the URL is opened
- **THEN** the picker lists the registered scenes and the hello scene plays
