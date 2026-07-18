import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import { Path } from "effect/Path";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { MotionCliError } from "../MotionCliError.js";
import {
	ensureEmptyDir,
	resolveProjectDir,
	scaffoldProject,
} from "../scaffold.js";

const PACKAGE_MANAGERS = ["pnpm", "npm", "yarn", "bun"] as const;
type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/** The manager that invoked us (`pnpm create …` etc.), if detectable. */
const detectPackageManager = (): PackageManager | undefined => {
	const agent = process.env.npm_config_user_agent ?? "";
	return PACKAGE_MANAGERS.find((pm) => agent.startsWith(pm));
};

const initFlags = {
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
	noInstall: Flag.boolean("no-install").pipe(
		Flag.withDescription("Skip dependency installation"),
	),
};

const promptDirectory = Prompt.text({
	message:
		'Where should the project be created? ("." for the current directory)',
	default: "my-motion-project",
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

type InitInput = {
	readonly directory: Option.Option<string>;
	readonly pm: Option.Option<PackageManager>;
	readonly noInstall: boolean;
};

const handler = (input: InitInput) =>
	Effect.gen(function* () {
		const path = yield* Path;
		const cwd = process.cwd();

		const dirInput =
			Option.getOrUndefined(input.directory) ?? (yield* promptDirectory);
		const { dir, name } = resolveProjectDir(path, cwd, dirInput);
		yield* ensureEmptyDir(dir);

		const pm = Option.getOrUndefined(input.pm) ?? (yield* promptPackageManager);

		yield* scaffoldProject(dir, name);
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

export const initCommand = Command.make("init", initFlags, handler).pipe(
	Command.withDescription("Scaffold a new effect-motion project"),
);
