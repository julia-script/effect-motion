## ADDED Requirements

### Requirement: Each published package ships a README
Every publishable workspace package (`effect-motion`, `@effect-motion/react`, `@effect-motion/export`) SHALL include a `README.md` at its package root so that its npm page renders a landing page instead of a blank listing. The README SHALL contain a one-line description, an install command, a minimal usage example, and a link to the docs site and repository.

#### Scenario: Package tarball includes the README
- **WHEN** `npm pack` (or `pnpm pack`) runs in a published package directory
- **THEN** the resulting tarball contains `README.md`

#### Scenario: README documents installation with the effect peer dependency
- **WHEN** a reader follows the README's install section
- **THEN** it installs the package together with `effect` (the peer dependency), matching the `>=4.0.0-beta.94` peer range

#### Scenario: README links to canonical documentation
- **WHEN** a reader wants more than the minimal example
- **THEN** the README links to the docs site and the GitHub repository rather than duplicating full documentation

### Requirement: README examples are consistent with the package API
Each README's usage example SHALL use the package's real public API surface so that a reader copying it gets working code.

#### Scenario: Example imports resolve against the package exports
- **WHEN** the README example's imports are checked against the package's `exports`
- **THEN** every imported symbol is part of that package's public API
