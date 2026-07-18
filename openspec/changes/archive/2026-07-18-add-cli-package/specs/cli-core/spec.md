## ADDED Requirements

### Requirement: Commands built on the Effect Command API
The `motion` bin SHALL be structured with the pinned effect version's Command API (`effect/unstable/cli`): a root command with `init`, `studio`, and `render` subcommands declared via `Command.make`/`Command.withSubcommands`, flags and positional arguments declared via `Flag`/`Argument`, and interactive input via the `Prompt` module. `--help` (root and per-subcommand) and `--version` SHALL come from the Command API. Command handlers SHALL be Effect programs using Effect platform services (`FileSystem`, `Path`, `ChildProcessSpawner`) rather than direct `node:fs`/`node:child_process` calls, and long-running resources (dev server, render pipeline) SHALL be scoped so interruption (Ctrl-C) releases them.

#### Scenario: Help generated from command definitions
- **WHEN** `motion --help` or `motion render --help` runs
- **THEN** usage, subcommands, flags, and descriptions are printed from the declared command structure, exit code 0

#### Scenario: Unknown subcommand
- **WHEN** `motion rendr` runs
- **THEN** the CLI exits non-zero with the Command API's unknown-subcommand error naming the valid subcommands

### Requirement: Single tagged CLI error type
The package SHALL define one tagged error type (a `Data.TaggedError`-based `MotionCliError`) carrying a `reason` discriminant, a human-readable `message` naming the offender (file, target, or path), and an optional `cause` wrapping an upstream error. Every subcommand handler's typed error channel SHALL be this type: upstream failures (config load, scene import, `Ffmpeg.EncodeError`, `ThorvgException`, platform errors) MUST be wrapped into it where they occur, and custom failures (unknown target, non-empty scaffold directory) MUST be constructed as it directly.

#### Scenario: Upstream error wrapped, not leaked
- **WHEN** ffmpeg fails while rendering a target
- **THEN** the failure reaching the top level is a `MotionCliError` whose `message` names the target and whose `cause` is the original `EncodeError`

#### Scenario: Handler error channels are uniform
- **WHEN** the CLI package typechecks
- **THEN** each subcommand handler's error type is `MotionCliError` (no raw upstream error types escape a handler)

### Requirement: Errors render as messages, not stack traces
A `MotionCliError` reaching the top level SHALL print its `message` (and reason context) to stderr and exit non-zero, without a stack trace in normal operation; a `--verbose` global flag SHALL additionally print the full cause chain. Only defects (bugs in the CLI itself) may surface as stack traces.

#### Scenario: Clean failure output
- **WHEN** `motion render` runs where no config exists
- **THEN** stderr shows a one-line-plus-hint message (no stack trace) and the exit code is non-zero

#### Scenario: Verbose shows the cause chain
- **WHEN** the same failure runs with `--verbose`
- **THEN** the wrapped cause details are printed after the message
