# cli-init Delta Specification

## REMOVED Requirements

### Requirement: Interactive scaffold with directory-derived project name
**Reason**: Scaffolding moves out of `@effect-motion/cli` into the dedicated `create-effect-motion` package; `motion init` is removed.
**Migration**: Run `pnpm create effect-motion` (or the npm/yarn/bun equivalent). The prompt behavior is preserved verbatim by the `create-effect-motion` capability.

### Requirement: Generated project structure
**Reason**: Capability absorbed by `create-effect-motion`; the generated tree is unchanged, only the entry point moved.
**Migration**: Identical requirement lives in the `create-effect-motion` spec.

### Requirement: Exact dependency pinning
**Reason**: Capability absorbed by `create-effect-motion`; pins are now derived from the scaffolder package's own release (same mechanism, new home).
**Migration**: Identical pinning behavior lives in the `create-effect-motion` spec ("Exact dependency pinning derived from the scaffolder's own release").
