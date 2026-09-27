import * as Frames from "@effect-motion/export/Frames";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import { FileSystem } from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import { Path } from "effect/Path";
import * as Stream from "effect/Stream";
import { Argument, Command, Flag } from "effect/unstable/cli";
import type * as Resource from "effect-motion/Resource";
import * as Scene from "effect-motion/Scene";
import {
	causeChain,
	causeLine,
	failWithCause,
	MotionCliError,
	verboseFlag,
} from "../MotionCliError.js";
import { isStudioConfig, resolveEntries } from "../StudioConfig.js";
import { makeViteLoader } from "../ViteLoader.js";

/**
 * `motion frames [scene]` — sample a `studio.ts` scene headlessly: PNG stills
 * (default), a contact sheet (`--sheet`) and/or JSON state (`--json`).
 *
 * A thin wrapper over `@effect-motion/export`: `Frames` picks the frames
 * (GPU-free), `Stills` renders them. `Stills` is imported lazily so a
 * JSON-only run never loads the GPU renderer (Dawn).
 */

const framesArgs = {
	scene: Argument.optional(
		Argument.String("scene").pipe(
			Argument.withDescription(
				"Scene key from studio.ts (omit to list the scenes and their lengths)",
			),
		),
	),
	at: Flag.optional(
		Flag.String("at").pipe(
			Flag.withDescription(
				'Frames to sample: indices, times, percentages or end — e.g. "0,1.5s,50%,end"',
			),
		),
	),
	count: Flag.optional(
		Flag.Int("count").pipe(
			Flag.withDescription(
				"Sample N evenly spaced frames, first and last included (default 6)",
			),
		),
	),
	range: Flag.optional(
		Flag.String("range").pipe(
			Flag.withDescription(
				'Spread --count over FROM..TO instead of the whole scene, ends included — e.g. "7.5s..8.5s", "50%..end"',
			),
		),
	),
	sheet: Flag.Boolean("sheet").pipe(
		Flag.withDefault(false),
		Flag.withDescription(
			"Write one contact sheet (sheet.png) instead of stills",
		),
	),
	json: Flag.optional(
		Flag.String("json").pipe(
			Flag.withDescription(
				'Write frame state as JSON to a path, or to stdout with "-" (no GPU needed)',
			),
		),
	),
	out: Flag.optional(
		Flag.String("out").pipe(
			Flag.withDescription(
				"Output directory (default <project>/.motion/frames/<scene>)",
			),
		),
	),
	studio: Flag.String("studio").pipe(
		Flag.withDefault("./studio.ts"),
		Flag.withDescription("Studio entrypoint registering the scenes"),
	),
	dpr: Flag.optional(
		Flag.Finite("dpr").pipe(
			Flag.withDescription("Supersampling factor for PNGs (default 1)"),
		),
	),
	tileWidth: Flag.Int("tile-width").pipe(
		Flag.withDefault(480),
		Flag.withDescription(
			"Max width of each contact-sheet tile in pixels; larger frames are downscaled (default 480)",
		),
	),
};

type FramesInput = {
	readonly scene: Option.Option<string>;
	readonly at: Option.Option<string>;
	readonly count: Option.Option<number>;
	readonly range: Option.Option<string>;
	readonly sheet: boolean;
	readonly json: Option.Option<string>;
	readonly out: Option.Option<string>;
	readonly studio: string;
	readonly dpr: Option.Option<number>;
	readonly tileWidth: number;
};

const seconds = (time: number) => `${Number(time.toFixed(3))}s`;

const renderFailed = (message: string) =>
	failWithCause("RenderFailed", message);

const handler = (input: FramesInput) =>
	Effect.gen(function* () {
		const path = yield* Path;
		const fs = yield* FileSystem;
		const cwd = process.cwd();

		const entryAbs = path.resolve(cwd, input.studio);
		if (!(yield* Effect.orDie(fs.exists(entryAbs)))) {
			return yield* new MotionCliError({
				reason: "ConfigNotFound",
				message:
					`no studio entrypoint at ${input.studio} — create a studio.ts that ` +
					"default-exports `studioConfig({ scenes: { ... } })`, or pass " +
					"`--studio ./my.studio.ts`",
			});
		}
		const projectRoot = path.dirname(entryAbs);

		const loader = yield* makeViteLoader(projectRoot);
		const config = (yield* loader.load(entryAbs)).default;
		const entries = yield* Effect.try({
			try: () => resolveEntries(config, entryAbs),
			catch: (error) =>
				error instanceof MotionCliError
					? error
					: new MotionCliError({
							reason: "ConfigInvalid",
							message: `${entryAbs}: invalid studio config`,
							cause: error,
						}),
		});
		const keys = entries.map((e) => e.key);

		// the loaded module is untyped: studioConfig checked in the user's
		// studio.ts that `layers` covers every scene's loaders. Restate that
		// pairing once, so rendering frames without the layers is a compile
		// error here (the loaders are read from context at render time)
		const layers = (
			isStudioConfig(config) && config.layers !== undefined
				? config.layers
				: Layer.empty
		) as Layer.Layer<Resource.LoaderBrand, unknown>;
		const loaders = yield* Layer.build(layers).pipe(
			renderFailed("could not build the studio's layers"),
		);
		// same settings the studio Player runs the entry with
		const settingsOf = (entry: (typeof entries)[number]) => {
			const { fps, settings } = entry.options;
			return { ...(fps === undefined ? {} : { frameRate: fps }), ...settings };
		};
		const sceneOf = (entry: (typeof entries)[number]) =>
			entry.scene as Scene.Scene<unknown, Resource.LoaderBrand>;

		// ponytail: runs every scene to the end to measure it (no rendering);
		// cache lengths if studios grow scenes slow enough to matter
		if (Option.isNone(input.scene)) {
			const verbose = yield* verboseFlag;
			const width = Math.max(...keys.map((k) => k.length));
			for (const entry of entries) {
				const settings = settingsOf(entry);
				const length =
					settings.maxFrames === Number.POSITIVE_INFINITY
						? Effect.succeed("infinite")
						: Stream.runFold(
								Scene.stream(sceneOf(entry), settings),
								() => ({ frames: 0, frameRate: 0 }),
								(acc, frame) => ({
									frames: acc.frames + 1,
									frameRate: frame.frameRate,
								}),
							).pipe(
								Effect.map(
									({ frames, frameRate }) =>
										`${frames} frames  ${frameRate === 0 ? "0s" : seconds(frames / frameRate)}`,
								),
							);
				const exit = yield* Effect.exit(length);
				yield* Console.log(
					`${entry.key.padEnd(width)}  ${Exit.isSuccess(exit) ? exit.value : `failed to run: ${causeLine(exit.cause)}`}`,
				);
				if (verbose && Exit.isFailure(exit)) {
					for (const line of causeChain(exit.cause)) yield* Console.log(line);
				}
			}
			return;
		}
		const key = input.scene.value;
		const entry = entries.find((e) => e.key === key);
		if (entry === undefined) {
			return yield* new MotionCliError({
				reason: "UnknownTarget",
				message: `no scene "${key}" in ${input.studio} — available: ${keys.join(", ")}`,
			});
		}

		const invalid = (message: string) =>
			new MotionCliError({ reason: "InvalidFrameSelection", message });
		if (Option.isSome(input.at) && Option.isSome(input.count)) {
			return yield* invalid("pass --at or --count, not both");
		}
		if (Option.isSome(input.at) && Option.isSome(input.range)) {
			return yield* invalid(
				"pass --at or --range, not both (--range spreads --count)",
			);
		}
		if (input.tileWidth < 1) {
			return yield* invalid(
				`invalid --tile-width ${input.tileWidth}: must be at least 1`,
			);
		}
		const range = Option.getOrUndefined(input.range);
		if (range !== undefined && !/^\S+\.\.\S+$/.test(range.trim())) {
			return yield* invalid(
				`invalid --range "${range}": use FROM..TO, e.g. 7.5s..8.5s or 50%..end`,
			);
		}
		const selection = Option.isSome(input.at)
			? input.at.value
			: `count ${Option.getOrElse(input.count, () => 6)}${range === undefined ? "" : ` ${range.trim()}`}`;

		const samples = yield* Frames.sample(
			sceneOf(entry),
			selection,
			settingsOf(entry),
		).pipe(
			Effect.mapError((error) =>
				error instanceof Frames.FrameSelectionError
					? new MotionCliError({
							reason: "InvalidFrameSelection",
							message: `${key}: ${error.message}`,
						})
					: error,
			),
			renderFailed(`scene "${key}" failed while sampling`),
		);

		const jsonToStdout = Option.getOrUndefined(input.json) === "-";
		// keep stdout pure JSON when it carries the JSON
		const report = jsonToStdout ? Console.error : Console.log;
		const outDir = Option.match(input.out, {
			onNone: () => path.join(projectRoot, ".motion", "frames", key),
			onSome: (out) => path.resolve(cwd, out),
		});
		const shown = (file: string) => {
			const relative = path.relative(cwd, file);
			return relative.startsWith("..") ? file : relative;
		};
		const write = (file: string, data: Uint8Array | string) =>
			Effect.gen(function* () {
				yield* fs.makeDirectory(path.dirname(file), { recursive: true });
				yield* typeof data === "string"
					? fs.writeFileString(file, data)
					: fs.writeFile(file, data);
			}).pipe(renderFailed(`could not write ${file}`));

		if (Option.isSome(input.json)) {
			const json = `${JSON.stringify(Frames.toJson(samples), null, 2)}\n`;
			if (jsonToStdout) {
				// resume once the chunk is handed off: under bun a piped
				// console.log is cut at 64 KB when the process exits after it
				yield* Effect.callback<void>((resume) => {
					process.stdout.write(json, () => resume(Effect.void));
				});
			} else {
				const file = path.resolve(cwd, input.json.value);
				yield* write(file, json);
				yield* report(shown(file));
			}
		}

		const images = input.sheet || Option.isNone(input.json);
		if (!images) return;

		const Stills = yield* Effect.tryPromise(
			() => import("@effect-motion/export/Stills"),
		).pipe(renderFailed("could not load the GPU renderer"));
		const dpr = Option.getOrElse(input.dpr, () => 1);

		if (input.sheet) {
			const sheet = yield* Stills.contactSheet(
				samples.map((s) => s.data),
				{ dpr, maxTileWidth: input.tileWidth },
			).pipe(
				Effect.provide(loaders),
				renderFailed(`could not render the sheet for "${key}"`),
			);
			const file = path.join(outDir, "sheet.png");
			yield* write(file, sheet.png);
			yield* report(
				`${shown(file)} ${sheet.columns}x${sheet.rows} tile=${sheet.tileWidth}x${sheet.tileHeight}`,
			);
			for (const [tile, s] of samples.entries()) {
				yield* report(`tile=${tile} frame=${s.frame} time=${seconds(s.time)}`);
			}
			return;
		}

		// one still per distinct frame, named by frame index
		const unique = samples.filter(
			(s, i) => samples.findIndex((x) => x.frame === s.frame) === i,
		);
		const pngs = yield* Stills.render(
			unique.map((s) => s.data),
			{ dpr },
		).pipe(
			Effect.provide(loaders),
			renderFailed(`could not render stills for "${key}"`),
		);
		for (const [i, s] of unique.entries()) {
			const png = pngs[i];
			if (png === undefined) continue;
			const file = path.join(outDir, `${String(s.frame).padStart(4, "0")}.png`);
			yield* write(file, png);
			yield* report(`${shown(file)} frame=${s.frame} time=${seconds(s.time)}`);
		}
	}).pipe(Effect.scoped);

export const framesCommand = Command.make("frames", framesArgs, handler).pipe(
	Command.withDescription(
		"Sample frames of a studio.ts scene headlessly: PNG stills, a contact sheet (--sheet) or JSON state (--json)",
	),
);
