import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { MotionCliError } from "./MotionCliError.js";
import { COMPANIONS, PINS } from "./pins.js";

/**
 * The non-interactive core of `motion init`: everything except the prompts,
 * so tests can drive it directly. Copies templates/default into the target
 * directory and generates package.json from the pinned versions.
 */

/** Directory of the shipped templates (dist/scaffold.js → ../templates). */
export const templatesDir = (path: Path) =>
	path.join(
		path.dirname(new URL(import.meta.url).pathname),
		"..",
		"templates",
		"default",
	);

/** `.` means "here"; the project is named after the resolved directory. */
export const resolveProjectDir = (
	path: Path,
	cwd: string,
	input: string,
): { dir: string; name: string } => {
	const dir = path.resolve(cwd, input);
	return { dir, name: path.basename(dir) };
};

/** Non-empty means anything but dotfiles (a fresh `git init` is fine). */
export const ensureEmptyDir = (dir: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem;
		if (!(yield* fs.exists(dir))) return;
		const entries = yield* fs.readDirectory(dir);
		const meaningful = entries.filter((entry) => !entry.startsWith("."));
		if (meaningful.length > 0) {
			return yield* new MotionCliError({
				reason: "ScaffoldTargetNotEmpty",
				message: `${dir} is not empty (found ${meaningful.slice(0, 3).join(", ")}${meaningful.length > 3 ? ", …" : ""}) — choose an empty or new directory`,
			});
		}
	}).pipe(wrapFsError("ScaffoldFailed", `could not inspect ${dir}`));

const wrapFsError =
	(reason: "ScaffoldFailed", message: string) =>
	<A, R>(effect: Effect.Effect<A, unknown, R>) =>
		Effect.mapError(effect, (cause) =>
			cause instanceof MotionCliError
				? cause
				: new MotionCliError({ reason, message, cause }),
		);

const packageJson = (name: string) =>
	`${JSON.stringify(
		{
			name,
			private: true,
			version: "0.0.0",
			type: "module",
			scripts: {
				studio: "motion studio",
				render: "motion render",
			},
			dependencies: {
				"@effect-motion/export": PINS["@effect-motion/export"],
				"@effect-motion/react": PINS["@effect-motion/react"],
				effect: PINS.effect,
				"effect-motion": PINS["effect-motion"],
				react: COMPANIONS.react,
				"react-dom": COMPANIONS["react-dom"],
			},
			devDependencies: {
				"@effect-motion/cli": PINS["@effect-motion/cli"],
				"@types/node": COMPANIONS["@types/node"],
				"@types/react": COMPANIONS["@types/react"],
				"@types/react-dom": COMPANIONS["@types/react-dom"],
				typescript: COMPANIONS.typescript,
			},
		},
		null,
		"\t",
	)}\n`;

/** Copy the template tree + write the generated package.json. */
export const scaffoldProject = (dir: string, name: string) =>
	Effect.gen(function* () {
		const fs = yield* FileSystem;
		const path = yield* Path;
		const templates = templatesDir(path);
		yield* fs.makeDirectory(dir, { recursive: true });
		yield* copyTree(fs, path, templates, dir);
		// npm mangles nested .gitignore/package.json files in published
		// tarballs, so both ship outside the template tree
		yield* fs.writeFileString(
			path.join(dir, "package.json"),
			packageJson(name),
		);
		yield* fs.rename(
			path.join(dir, "_gitignore"),
			path.join(dir, ".gitignore"),
		);
	}).pipe(wrapFsError("ScaffoldFailed", `could not scaffold ${dir}`));

const copyTree = (
	fs: FileSystem,
	path: Path,
	from: string,
	to: string,
): Effect.Effect<void, unknown> =>
	Effect.gen(function* () {
		const entries = yield* fs.readDirectory(from);
		for (const entry of entries) {
			const src = path.join(from, entry);
			const dst = path.join(to, entry);
			const info = yield* fs.stat(src);
			if (info.type === "Directory") {
				yield* fs.makeDirectory(dst, { recursive: true });
				yield* copyTree(fs, path, src, dst);
			} else {
				yield* fs.copyFile(src, dst);
			}
		}
	});
