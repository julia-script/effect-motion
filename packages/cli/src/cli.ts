import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { CliError, Command, Flag, GlobalFlag } from "effect/unstable/cli";
import { initCommand } from "./commands/init.js";
import { renderCommand } from "./commands/render.js";
import { studioCommand } from "./commands/studio.js";
import { type MotionCliError, renderForTerminal } from "./MotionCliError.js";
import { PINS } from "./pins.js";

// registered globally so `--verbose` parses anywhere on the command line;
// the reporter reads argv directly because it sits outside handler context
const verboseFlag = GlobalFlag.setting("verbose")({
	flag: Flag.boolean("verbose").pipe(
		Flag.withDescription("Print full error cause chains"),
	),
});

export const rootCommand = Command.make("motion").pipe(
	Command.withDescription(
		"effect-motion: scaffold projects, preview scenes, render videos",
	),
	Command.withSubcommands([initCommand, studioCommand, renderCommand]),
	Command.withGlobalFlags([verboseFlag]),
);

export const CLI_VERSION = PINS["@effect-motion/cli"];

/**
 * The single exhaustive failure boundary (design D3a): MotionCliError
 * prints its message (cause chain under --verbose) and sets a non-zero
 * exit; Command API errors print their diagnostic (help output was already
 * rendered for ShowHelp). Anything past this boundary is a defect.
 */
export const reportErrors = <A, R>(
	program: Effect.Effect<A, MotionCliError | CliError.CliError, R>,
	verbose: boolean,
): Effect.Effect<A | undefined, never, R> =>
	program.pipe(
		Effect.catchTag("MotionCliError", (error) =>
			Effect.gen(function* () {
				yield* Console.error(renderForTerminal(error, verbose));
				process.exitCode = 1;
				return undefined;
			}),
		),
		Effect.catchIf(CliError.isCliError, (error) =>
			error._tag === "ShowHelp"
				? Effect.succeed(undefined)
				: Effect.gen(function* () {
						yield* Console.error(error.message);
						process.exitCode = 1;
						return undefined;
					}),
		),
	);
