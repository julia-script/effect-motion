import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import * as Option from "effect/Option";
import { Path } from "effect/Path";
import { Argument, Command } from "effect/unstable/cli";
import { MotionCliError } from "../MotionCliError.js";
import { makeViteLoader } from "../ViteLoader.js";

/**
 * `motion render [file]` — execute a render entrypoint.
 *
 * The entrypoint is an ordinary program: it calls `Video.render(scene, out,
 * options)` and provides the scene's loader layers itself, so loader
 * coverage is a compile-time property of the USER's file (`Video.render`'s
 * own signature demands it). The CLI's job is thin: load the module through
 * the shared Vite pipeline, run its default-exported Effect against the
 * platform services bin.ts provides (ChildProcessSpawner included), and
 * render failures as CLI errors. The same file runs without the CLI by
 * self-providing `NodeServices` (documented in `@effect-motion/export`).
 */

const renderArgs = {
	file: Argument.optional(
		Argument.string("file").pipe(
			Argument.withDescription(
				"Render entrypoint (default ./render.ts) — a module default-exporting an Effect",
			),
		),
	),
};

type RenderInput = {
	readonly file: Option.Option<string>;
};

const handler = (input: RenderInput) =>
	Effect.gen(function* () {
		const path = yield* Path;
		const fs = yield* FileSystem;
		const cwd = process.cwd();

		const requested = Option.getOrElse(input.file, () => "./render.ts");
		const entryAbs = path.isAbsolute(requested)
			? requested
			: path.resolve(cwd, requested);
		if (!(yield* Effect.orDie(fs.exists(entryAbs)))) {
			return yield* new MotionCliError({
				reason: "ConfigNotFound",
				message:
					`no render entrypoint at ${requested} — create a render.ts that ` +
					"default-exports a `Video.render(...)` effect (loader layers provided), " +
					"or pass a path: `motion render ./my.render.ts`",
			});
		}

		const loader = yield* makeViteLoader(path.dirname(entryAbs));
		const module_ = yield* loader.load(entryAbs);
		const program = module_.default;
		if (!Effect.isEffect(program)) {
			return yield* new MotionCliError({
				reason: "ConfigInvalid",
				message:
					`${entryAbs}: default export is not an Effect — a render entrypoint ` +
					'default-exports its render program (e.g. `export default Video.render(scene, "output/out.mp4").pipe(Effect.provide(layers))`)',
			});
		}

		// run against the handler's own context (bin.ts provides the Node
		// platform services). An effect requiring anything beyond them fails
		// here with Effect's named missing-service defect — the loader half of
		// the contract was already enforced in the user's file at compile time.
		yield* (program as Effect.Effect<unknown, unknown>).pipe(
			Effect.mapError(
				(cause) =>
					new MotionCliError({
						reason: "RenderFailed",
						message: `render entrypoint failed (${entryAbs})`,
						cause,
					}),
			),
		);
		yield* Console.log(`rendered ${requested}`);
	}).pipe(Effect.scoped);

export const renderCommand = Command.make("render", renderArgs, handler).pipe(
	Command.withDescription(
		"Execute a render entrypoint (default ./render.ts) with the platform provided",
	),
);
