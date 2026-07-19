import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Path } from "effect/Path";
import {
	Argument,
	CliError,
	Command,
	Flag,
	GlobalFlag,
	Prompt,
} from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { MotionCliError, renderForTerminal } from "./MotionCliError.js";
import { VERSION } from "./pins.js";
import {
	ensureEmptyDir,
	resolveProjectDir,
	scaffoldProject,
} from "./scaffold.js";

const DEFAULT_DIRECTORY = "my-motion-project";

const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** The manager that invoked us (`pnpm create …` etc.), if detectable. */
const detectPackageManager = (): PackageManager | undefined => {
	const agent = process.env.npm_config_user_agent ?? "";
	return PACKAGE_MANAGERS.find((pm) => agent.startsWith(pm));
};

const flags = {
	directory: Argument.string("directory").pipe(
		Argument.withDescription(
			'Target directory ("." scaffolds into the current directory)',
		),
		Argument.optional,
	),
	pm: Flag.optional(
		Flag.choice("pm", PACKAGE_MANAGERS).pipe(
			Flag.withDescription("Package manager (skips the prompt)"),
		),
	),
	biome: Flag.boolean("biome").pipe(
		Flag.withDescription(
			"Set up Biome for linting/formatting (skips the prompt)",
		),
	),
	noBiome: Flag.boolean("no-biome").pipe(
		Flag.withDescription("Skip the Biome setup (skips the prompt)"),
	),
	noInstall: Flag.boolean("no-install").pipe(
		Flag.withDescription("Skip dependency installation"),
	),
	yes: Flag.boolean("yes").pipe(
		Flag.withAlias("y"),
		Flag.withDescription(
			"Accept the default answer for every prompt not answered by a flag",
		),
	),
};

const promptDirectory = Prompt.text({
	message:
		'Where should the project be created? ("." for the current directory)',
	default: DEFAULT_DIRECTORY,
});

const promptPackageManager = Effect.suspend(() => {
	const detected = detectPackageManager();
	// detected manager listed first so plain Enter picks it
	const ordered = [
		...(detected ? [detected] : []),
		...PACKAGE_MANAGERS.filter((pm) => pm !== detected),
	];
	return Prompt.select<PackageManager>({
		message: "Which package manager?",
		choices: ordered.map((pm) => ({ title: pm, value: pm })),
	});
});

const promptBiome = Prompt.confirm({
	message: "Add Biome for linting/formatting?",
	initial: true,
});

const runInstall = (pm: PackageManager, dir: string) =>
	Effect.gen(function* () {
		const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
		const command = ChildProcess.make(pm, ["install"], {
			cwd: dir,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		yield* Effect.scoped(
			Effect.gen(function* () {
				const handle = yield* spawner.spawn(command);
				const code = yield* handle.exitCode;
				if (code !== 0) {
					return yield* new MotionCliError({
						reason: "InstallFailed",
						message: `${pm} install exited with code ${code} in ${dir} — run it manually`,
						cause: code,
					});
				}
			}),
		).pipe(
			Effect.catchTag("PlatformError", (cause) =>
				Effect.fail(
					new MotionCliError({
						reason: "InstallFailed",
						message: `could not run "${pm} install" in ${dir} — is ${pm} installed?`,
						cause,
					}),
				),
			),
		);
	});

/** Exit code of a git command in `dir`; fails with PlatformError if git is absent. */
const gitExitCode = (dir: string, args: ReadonlyArray<string>) =>
	Effect.scoped(
		Effect.gen(function* () {
			const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
			const handle = yield* spawner.spawn(
				ChildProcess.make("git", args, {
					cwd: dir,
					stdin: "ignore",
					stdout: "ignore",
					stderr: "ignore",
				}),
			);
			return yield* handle.exitCode;
		}),
	);

/**
 * `git init` the fresh project, unless it is already inside a work tree
 * (scaffolding into a subdirectory of an existing repo). Git being absent
 * or failing is never fatal — the scaffold is complete without it.
 */
export const gitInit = (dir: string) =>
	Effect.gen(function* () {
		const inside = yield* gitExitCode(dir, [
			"rev-parse",
			"--is-inside-work-tree",
		]);
		if (inside === 0) return;
		yield* gitExitCode(dir, ["init"]);
	}).pipe(Effect.ignore);

type CreateInput = {
	readonly directory: Option.Option<string>;
	readonly pm: Option.Option<PackageManager>;
	readonly biome: boolean;
	readonly noBiome: boolean;
	readonly noInstall: boolean;
	readonly yes: boolean;
};

const handler = (input: CreateInput) =>
	Effect.gen(function* () {
		const path = yield* Path;
		const cwd = process.cwd();

		const dirInput =
			Option.getOrUndefined(input.directory) ??
			(input.yes ? DEFAULT_DIRECTORY : yield* promptDirectory);
		const { dir, name } = resolveProjectDir(path, cwd, dirInput);
		yield* ensureEmptyDir(dir);

		const pm =
			Option.getOrUndefined(input.pm) ??
			(input.yes
				? (detectPackageManager() ?? "npm")
				: yield* promptPackageManager);

		// explicit flags win over --yes; --no-biome beats --biome if both are passed
		const biome = input.noBiome
			? false
			: input.biome || input.yes || (yield* promptBiome);

		yield* scaffoldProject(dir, name, { biome });
		yield* gitInit(dir);
		yield* Console.log(`Scaffolded ${name} in ${dir}`);

		if (input.noInstall) {
			yield* Console.log(
				[
					"",
					"Next steps:",
					dir === cwd ? "" : `  cd ${path.relative(cwd, dir)}`,
					`  ${pm} install`,
					`  ${pm === "npm" ? "npm run" : pm} studio`,
				]
					.filter((line) => line !== "")
					.join("\n"),
			);
			return;
		}

		yield* runInstall(pm, dir);
		yield* Console.log(
			[
				"",
				`${name} is ready.`,
				dir === cwd ? "" : `  cd ${path.relative(cwd, dir)}`,
				`  ${pm === "npm" ? "npm run" : pm} studio    # preview scenes with hot reload`,
				`  ${pm === "npm" ? "npm run" : pm} render    # render targets from motion.config.ts`,
			]
				.filter((line) => line !== "")
				.join("\n"),
		);
	}).pipe(
		// ctrl-c in a prompt is an interruption, not a failure
		Effect.catchTag("QuitError", () => Effect.interrupt),
	);

// registered globally so `--verbose` parses anywhere on the command line;
// the reporter reads argv directly because it sits outside handler context
const verboseFlag = GlobalFlag.setting("verbose")({
	flag: Flag.boolean("verbose").pipe(
		Flag.withDescription("Print full error cause chains"),
	),
});

export const rootCommand = Command.make(
	"create-effect-motion",
	flags,
	handler,
).pipe(
	Command.withDescription("Scaffold a new effect-motion project"),
	Command.withGlobalFlags([verboseFlag]),
);

export const CLI_VERSION = VERSION;

/**
 * The single exhaustive failure boundary: MotionCliError prints its message
 * (cause chain under --verbose) and sets a non-zero exit; Command API errors
 * print their diagnostic (help output was already rendered for ShowHelp).
 * Anything past this boundary is a defect.
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
