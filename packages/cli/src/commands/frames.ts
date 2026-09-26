import * as Frames from "@effect-motion/export/Frames";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import * as Option from "effect/Option";
import { Path } from "effect/Path";
import { Argument, Command, Flag } from "effect/unstable/cli";
import type * as Scene from "effect-motion/Scene";
import { MotionCliError } from "../MotionCliError.js";
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
				"Scene key from studio.ts (omit to list the available keys)",
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
};

type FramesInput = {
	readonly scene: Option.Option<string>;
	readonly at: Option.Option<string>;
	readonly count: Option.Option<number>;
	readonly sheet: boolean;
	readonly json: Option.Option<string>;
	readonly out: Option.Option<string>;
	readonly studio: string;
	readonly dpr: Option.Option<number>;
};

const seconds = (time: number) => `${Number(time.toFixed(3))}s`;

const renderFailed = (message: string) => (cause: unknown) =>
	new MotionCliError({ reason: "RenderFailed", message, cause });

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

		// ponytail: keys only — frame counts would run every scene; add when
		// listing needs durations
		if (Option.isNone(input.scene)) {
			yield* Console.log(keys.join("\n"));
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

		if (Option.isSome(input.at) && Option.isSome(input.count)) {
			return yield* new MotionCliError({
				reason: "InvalidFrameSelection",
				message: "pass --at or --count, not both",
			});
		}
		const selection = Option.isSome(input.at)
			? input.at.value
			: `count ${Option.getOrElse(input.count, () => 6)}`;

		// same settings the studio Player runs the entry with
		const { fps, settings } = entry.options;
		const layers =
			isStudioConfig(config) && config.layers !== undefined
				? config.layers
				: undefined;
		// the loaded module is untyped: the scene's loader coverage was
		// checked in the user's studio.ts (studioConfig), and a scene needing
		// more than `layers` dies with Effect's named missing-service defect
		const sampling = Frames.sample(
			entry.scene as Scene.Scene<unknown, never>,
			selection,
			{ ...(fps === undefined ? {} : { frameRate: fps }), ...settings },
		);
		const samples = yield* (
			layers === undefined ? sampling : Effect.provide(sampling, layers)
		).pipe(
			Effect.mapError((error) =>
				error instanceof Frames.FrameSelectionError
					? new MotionCliError({
							reason: "InvalidFrameSelection",
							message: `${key}: ${error.message}`,
						})
					: renderFailed(`scene "${key}" failed while sampling`)(error),
			),
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
			}).pipe(Effect.mapError(renderFailed(`could not write ${file}`)));

		if (Option.isSome(input.json)) {
			const json = `${JSON.stringify(Frames.toJson(samples), null, 2)}\n`;
			if (jsonToStdout) {
				yield* Console.log(json.trimEnd());
			} else {
				const file = path.resolve(cwd, input.json.value);
				yield* write(file, json);
				yield* report(shown(file));
			}
		}

		const images = input.sheet || Option.isNone(input.json);
		if (!images) return;

		const Stills = yield* Effect.tryPromise({
			try: () => import("@effect-motion/export/Stills"),
			catch: renderFailed("could not load the GPU renderer"),
		});
		const dpr = Option.getOrElse(input.dpr, () => 1);

		if (input.sheet) {
			const sheet = yield* Stills.contactSheet(
				samples.map((s) => s.data),
				{ dpr },
			).pipe(
				Effect.mapError(
					renderFailed(`could not render the sheet for "${key}"`),
				),
			);
			const file = path.join(outDir, "sheet.png");
			yield* write(file, sheet.png);
			yield* report(`${shown(file)} ${sheet.columns}x${sheet.rows}`);
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
			Effect.mapError(renderFailed(`could not render stills for "${key}"`)),
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
