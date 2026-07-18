import { Video } from "@effect-motion/export";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import * as Option from "effect/Option";
import { Path } from "effect/Path";
import * as Result from "effect/Result";
import { Argument, Command, Flag } from "effect/unstable/cli";
import type { Scene } from "effect-motion";
import {
	DEFAULT_OUTPUT_DIR,
	type RenderOverrides,
	type ResolvedTarget,
	resolveTarget,
} from "../Config.js";
import { findConfig, loadConfig } from "../ConfigLoader.js";
import { MotionCliError } from "../MotionCliError.js";
import { makeViteLoader, type ViteLoader } from "../ViteLoader.js";

const opt = <A>(o: Option.Option<A>): A | undefined => Option.getOrUndefined(o);

const renderFlags = {
	config: Flag.optional(
		Flag.string("config").pipe(
			Flag.withDescription("Path to a motion.config.ts (tsc -p style)"),
		),
	),
	width: Flag.optional(Flag.integer("width")),
	height: Flag.optional(Flag.integer("height")),
	fps: Flag.optional(
		Flag.integer("fps").pipe(Flag.withDescription("Frame rate override")),
	),
	dpr: Flag.optional(
		Flag.float("dpr").pipe(
			Flag.withDescription(
				"Supersampling factor (output pixels = scene × dpr)",
			),
		),
	),
	seed: Flag.optional(Flag.string("seed")),
	maxFrames: Flag.optional(Flag.integer("max-frames")),
	frames: Flag.optional(
		Flag.integer("frames").pipe(
			Flag.withDescription("Cap encoded frames (required for infinite scenes)"),
		),
	),
	outDir: Flag.optional(
		Flag.string("out-dir").pipe(
			Flag.withDescription("Output directory override"),
		),
	),
	format: Flag.optional(Flag.choice("format", ["mp4"] as const)),
	targets: Argument.string("targets").pipe(
		Argument.withDescription(
			"Target names from the config, or one scene file path",
		),
		Argument.variadic(),
	),
};

type RenderInput = {
	readonly config: Option.Option<string>;
	readonly width: Option.Option<number>;
	readonly height: Option.Option<number>;
	readonly fps: Option.Option<number>;
	readonly dpr: Option.Option<number>;
	readonly seed: Option.Option<string>;
	readonly maxFrames: Option.Option<number>;
	readonly frames: Option.Option<number>;
	readonly outDir: Option.Option<string>;
	readonly format: Option.Option<"mp4">;
	readonly targets: ReadonlyArray<string>;
};

const overridesFrom = (input: RenderInput): RenderOverrides => {
	const raw = {
		width: opt(input.width),
		height: opt(input.height),
		frameRate: opt(input.fps),
		dpr: opt(input.dpr),
		seed: opt(input.seed),
		maxFrames: opt(input.maxFrames),
		frames: opt(input.frames),
		outDir: opt(input.outDir),
		format: opt(input.format),
	};
	return Object.fromEntries(
		Object.entries(raw).filter(([, v]) => v !== undefined),
	) as RenderOverrides;
};

// a positional is a scene file (configless mode) iff it looks like a module
// path — target names never carry an extension
const isSceneFile = (arg: string) => /\.(ts|tsx|mts|js|mjs)$/.test(arg);

const sceneBasename = (file: string) => {
	const base = file.split("/").at(-1) ?? file;
	return base.replace(/\.(ts|tsx|mts|js|mjs)$/, "");
};

/** Map a resolved target onto the export package's options shape. */
const toVideoOptions = (target: ResolvedTarget): Video.VideoOptions => {
	const { dpr, ...settings } = target.settings;
	return {
		// ponytail: VideoSceneSettings doesn't name seed/backgroundColor, but
		// Video.render passes settings straight through to Scene.stream — the
		// cast is the CLI-side adaptation decided in design D2; collapse it if
		// the export package ever widens its settings type
		settings: settings as Video.VideoSceneSettings,
		...(dpr !== undefined ? { dpr } : {}),
		...(target.frames !== undefined ? { frames: target.frames } : {}),
	};
};

const renderOne = (
	loader: ViteLoader,
	baseDir: string,
	target: ResolvedTarget,
) =>
	Effect.gen(function* () {
		const path = yield* Path;
		const fs = yield* FileSystem;
		const sceneAbs = path.isAbsolute(target.scene)
			? target.scene
			: path.resolve(baseDir, target.scene);
		const module_ = yield* loader.load(sceneAbs);
		const scene = module_.scene;
		if (scene === undefined) {
			return yield* new MotionCliError({
				reason: "SceneLoadFailed",
				message: `${sceneAbs} has no \`scene\` export`,
			});
		}
		const outDirAbs = path.resolve(baseDir, target.outDir);
		yield* fs.makeDirectory(outDirAbs, { recursive: true }).pipe(
			Effect.mapError(
				(cause) =>
					new MotionCliError({
						reason: "RenderFailed",
						message: `could not create output directory ${outDirAbs}`,
						cause,
					}),
			),
		);
		const outFile = path.join(outDirAbs, target.fileName);
		yield* Video.render(
			scene as Scene.Scene<never, never>,
			outFile,
			toVideoOptions(target),
		).pipe(
			Effect.mapError(
				(cause) =>
					new MotionCliError({
						reason: "RenderFailed",
						message: `target "${target.name}" failed to render (${sceneAbs})`,
						cause,
					}),
			),
		);
		return outFile;
	});

const handler = (input: RenderInput) =>
	Effect.gen(function* () {
		const path = yield* Path;
		const cwd = process.cwd();
		const overrides = overridesFrom(input);

		// resolve the target list and the directory paths are relative to
		let baseDir: string;
		let resolved: ReadonlyArray<ResolvedTarget>;
		const [first] = input.targets;
		if (
			first !== undefined &&
			input.targets.length === 1 &&
			isSceneFile(first)
		) {
			// configless mode: one scene file, library defaults + flags
			baseDir = cwd;
			resolved = [
				resolveTarget(
					{
						name: sceneBasename(first),
						scene: path.resolve(cwd, first),
						output: DEFAULT_OUTPUT_DIR,
					},
					overrides,
				),
			];
		} else {
			const configPath = yield* findConfig(cwd, opt(input.config));
			baseDir = path.dirname(configPath);
			const loader = yield* makeViteLoader(baseDir);
			const config = yield* loadConfig(loader, configPath);
			if (input.targets.length === 0) {
				resolved = config.targets.map((t) => resolveTarget(t, overrides));
			} else {
				const known = new Map(config.targets.map((t) => [t.name, t]));
				const unknown = input.targets.filter((name) => !known.has(name));
				if (unknown.length > 0) {
					return yield* new MotionCliError({
						reason: "UnknownTarget",
						message:
							`unknown target${unknown.length > 1 ? "s" : ""} ${unknown.join(", ")} — ` +
							`known targets: ${[...known.keys()].join(", ") || "(none)"}`,
					});
				}
				resolved = input.targets.map((name) =>
					// biome-ignore lint/style/noNonNullAssertion: membership checked above
					resolveTarget(known.get(name)!, overrides),
				);
			}
			return yield* execute(loader, baseDir, resolved);
		}

		const loader = yield* makeViteLoader(baseDir);
		return yield* execute(loader, baseDir, resolved);
	}).pipe(Effect.scoped);

// render sequentially: ffmpeg already saturates the CPU per target
// (ponytail: parallelize only if profiling ever says otherwise)
const execute = (
	loader: ViteLoader,
	baseDir: string,
	targets: ReadonlyArray<ResolvedTarget>,
) =>
	Effect.gen(function* () {
		const failures: Array<MotionCliError> = [];
		for (const target of targets) {
			const result = yield* Effect.result(renderOne(loader, baseDir, target));
			if (Result.isSuccess(result)) {
				yield* Console.log(`✓ ${target.name} → ${result.success}`);
			} else {
				failures.push(result.failure);
				yield* Console.error(`✗ ${target.name}: ${result.failure.message}`);
			}
		}
		if (failures.length > 0) {
			return yield* new MotionCliError({
				reason: "RenderFailed",
				message: `${failures.length} of ${targets.length} target${targets.length > 1 ? "s" : ""} failed`,
				cause: failures[0],
			});
		}
	});

export const renderCommand = Command.make("render", renderFlags, handler).pipe(
	Command.withDescription(
		"Render targets from motion.config.ts (or one scene file) to video",
	),
);
