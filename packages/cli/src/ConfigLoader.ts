import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { type MotionConfig, validateConfig } from "./Config.js";
import { MotionCliError } from "./MotionCliError.js";
import type { ViteLoader } from "./ViteLoader.js";

export const CONFIG_FILE = "motion.config.ts";

/**
 * Resolve the config path: an explicit `--config` wins; otherwise walk up
 * from `cwd` to the nearest motion.config.ts (tsc `-p` semantics). Fails
 * with ConfigNotFound naming both escape hatches.
 */
export const findConfig = (
	cwd: string,
	explicit?: string,
): Effect.Effect<string, MotionCliError, FileSystem | Path> =>
	Effect.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path;
		if (explicit !== undefined) {
			const resolved = path.resolve(cwd, explicit);
			const exists = yield* orFalse(fs.exists(resolved));
			if (!exists) {
				return yield* new MotionCliError({
					reason: "ConfigNotFound",
					message: `config file not found: ${resolved}`,
				});
			}
			return resolved;
		}
		let dir = path.resolve(cwd);
		while (true) {
			const candidate = path.join(dir, CONFIG_FILE);
			if (yield* orFalse(fs.exists(candidate))) return candidate;
			const parent = path.dirname(dir);
			if (parent === dir) break;
			dir = parent;
		}
		return yield* new MotionCliError({
			reason: "ConfigNotFound",
			message:
				`no ${CONFIG_FILE} found from ${cwd} upward — ` +
				`create one (export default defineConfig({ targets: [...] })), pass --config <path>, ` +
				`or pass a scene file directly (motion render ./src/scenes/foo.ts)`,
		});
	});

// fs.exists fails on permission errors etc. — treat those as "not here"
const orFalse = <R>(effect: Effect.Effect<boolean, unknown, R>) =>
	Effect.catchCause(effect, () => Effect.succeed(false));

/** Load + validate a config module through the shared Vite loader. */
export const loadConfig = (
	loader: ViteLoader,
	configPath: string,
): Effect.Effect<MotionConfig, MotionCliError> =>
	Effect.gen(function* () {
		const module_ = yield* loader.load(configPath);
		return yield* Effect.try({
			try: () => validateConfig(module_.default, configPath),
			catch: (error) =>
				error instanceof MotionCliError
					? error
					: new MotionCliError({
							reason: "ConfigInvalid",
							message: `${configPath}: config validation crashed`,
							cause: error,
						}),
		});
	});
