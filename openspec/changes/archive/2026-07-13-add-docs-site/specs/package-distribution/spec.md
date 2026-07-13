## ADDED Requirements

### Requirement: Packages ship compiled output
The workspace packages `effect-motion` and `@effect-motion/react` SHALL build to `dist/` as ESM JavaScript with TypeScript declaration files, and their package `exports` SHALL resolve to the built output (types and default conditions). Consumers MUST NOT need to transpile workspace source to use the packages.

#### Scenario: Build emits ESM and declarations
- **WHEN** the package build task runs
- **THEN** `dist/` contains `.js` and `.d.ts` files mirroring `src/`, and `exports["."]` resolves to them

#### Scenario: A bundler consumes the package without transpile config
- **WHEN** an app that does not compile `node_modules` (e.g. Next.js without `transpilePackages`) imports the package
- **THEN** the import resolves to compiled JavaScript and typechecks against the shipped declarations

### Requirement: Build orchestration through the monorepo task graph
The monorepo SHALL provide a `build` task where each package builds after its workspace dependencies (`dependsOn: ^build`) with `dist/` as cacheable outputs. Tasks that consume built packages (`dev`, `check`) SHALL depend on upstream builds so a fresh clone works without manual build ordering. Package test tasks SHALL NOT require builds (tests import source directly).

#### Scenario: Fresh clone dev
- **WHEN** `pnpm install` is followed by running an app's dev task
- **THEN** upstream packages build automatically before the app starts

#### Scenario: Tests run without dist
- **WHEN** the test task runs with no `dist/` present
- **THEN** all package tests pass
