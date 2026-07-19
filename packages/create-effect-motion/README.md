# create-effect-motion

Scaffold a new [effect-motion](https://github.com/julia-script/effect-motion) project:

```sh
pnpm create effect-motion
# or: npm create effect-motion / yarn create effect-motion / bun create effect-motion
```

The prompts ask for a target directory, a package manager, and whether to set up [Biome](https://biomejs.dev) for linting/formatting. The generated project:

```
my-motion-project/
├─ src/
│  ├─ scenes/hello-world.ts   # a scene: a module exporting `scene`
│  ├─ assets/                 # static files
│  └─ main.ts                 # the movie — an ordinary scene composing the others
├─ motion.config.ts           # render targets
├─ AGENTS.md                  # authoring rules for AI coding agents
├─ biome.json                 # if Biome was selected
├─ package.json               # EXACT pins of effect-motion + effect
└─ tsconfig.json
```

Answering `.` scaffolds into the current directory and names the project after it. A `git init` runs automatically unless the directory already sits inside a repository. Then:

```sh
pnpm studio    # preview scenes with hot reload
pnpm render    # render targets from motion.config.ts to MP4
```

## Flags

Every prompt has a flag twin, so the scaffolder runs non-interactively in scripts and CI:

```sh
create-effect-motion my-app --pm pnpm --no-biome --no-install
create-effect-motion --yes    # accept every default (-y)
```

- `[directory]` — target directory (`.` for the current one)
- `--pm <pnpm|npm|yarn|bun>` — package manager (prompt defaults to the one that invoked the scaffolder)
- `--biome` / `--no-biome` — include or skip the Biome setup (prompt defaults to yes)
- `--no-install` — skip dependency installation
- `--yes` / `-y` — accept the default answer for every prompt not answered by a flag

## Version pinning

Dependency versions are pinned **exactly** (no ranges): each release of this package scaffolds the matching versions of `effect-motion`, `@effect-motion/react`, `@effect-motion/export`, `@effect-motion/cli`, and `effect`. The `effect` pin is a determinism invariant — upgrading effect can change seeded random sequences — so upgrade it and effect-motion together, deliberately.
