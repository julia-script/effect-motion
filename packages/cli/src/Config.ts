import type * as Runner from "effect-motion/Runner";
import { MotionCliError } from "./MotionCliError.js";

/**
 * The `motion.config.ts` contract. This module is intentionally
 * browser-safe (the studio app imports the user's config directly), so it
 * must stay free of Node-only imports — loading/discovery live in
 * ConfigLoader.ts.
 */

/**
 * Per-target render settings: the Runner `Settings` subset an export can
 * honor, plus `dpr`. From the author's perspective dpr is a rendering
 * setting like width/height; the render command maps it to the export
 * package's supersampling option.
 */
export interface TargetSettings {
	readonly width?: number;
	readonly height?: number;
	readonly frameRate?: number;
	readonly seed?: Runner.Seed;
	readonly maxFrames?: number;
	readonly backgroundColor?: Runner.Settings["backgroundColor"];
	readonly dpr?: number;
}

/** v1 ships MP4 only; the field exists so more containers slot in later. */
export type OutputFormat = "mp4";

export interface MotionTarget {
	/** Unique per config — doubles as the output file basename. */
	readonly name: string;
	/** Path to a module exporting `scene`, relative to the config file. */
	readonly scene: string;
	readonly settings?: TargetSettings;
	/** Output DIRECTORY (never a file), relative to the config file. */
	readonly output?: string;
	readonly format?: OutputFormat;
	/** Frame cap — required in practice for an infinite scene. */
	readonly frames?: number;
}

export interface MotionConfig {
	readonly targets: ReadonlyArray<MotionTarget>;
}

/** Identity helper that types `motion.config.ts` (vite/vitest convention). */
export const defineConfig = (config: MotionConfig): MotionConfig => config;

export const DEFAULT_OUTPUT_DIR = "./output";
export const DEFAULT_FORMAT: OutputFormat = "mp4";

/**
 * Validate the default export of a loaded config module. Plain structural
 * checks (not Schema): the config is authored in TS against `MotionConfig`,
 * so this only guards the untyped escape hatches (JS configs, `as any`).
 */
export const validateConfig = (
	value: unknown,
	configPath: string,
): MotionConfig => {
	const fail = (problem: string): never => {
		throw new MotionCliError({
			reason: "ConfigInvalid",
			message: `${configPath}: ${problem}`,
		});
	};
	if (typeof value !== "object" || value === null) {
		return fail(
			"default export is not a config object (did you forget `export default defineConfig({...})`?)",
		);
	}
	const config = value as MotionConfig;
	if (!Array.isArray(config.targets)) {
		return fail("config has no `targets` array");
	}
	const seen = new Set<string>();
	for (const [i, target] of config.targets.entries()) {
		if (typeof target !== "object" || target === null) {
			return fail(`targets[${i}] is not an object`);
		}
		if (typeof target.name !== "string" || target.name.length === 0) {
			return fail(`targets[${i}] is missing a \`name\``);
		}
		if (typeof target.scene !== "string" || target.scene.length === 0) {
			return fail(`target "${target.name}" is missing a \`scene\` path`);
		}
		if (seen.has(target.name)) {
			return fail(
				`duplicate target name "${target.name}" (names double as output filenames, so they must be unique)`,
			);
		}
		seen.add(target.name);
		if (target.format !== undefined && target.format !== "mp4") {
			return fail(
				`target "${target.name}" has unsupported format "${target.format}" (v1 supports "mp4")`,
			);
		}
	}
	return config;
};

/** Flag values a `motion render` invocation can lay over a target. */
export interface RenderOverrides {
	readonly width?: number;
	readonly height?: number;
	readonly frameRate?: number;
	readonly dpr?: number;
	readonly seed?: Runner.Seed;
	readonly maxFrames?: number;
	readonly frames?: number;
	readonly outDir?: string;
	readonly format?: OutputFormat;
}

/** A target with overrides applied and output location derived. */
export interface ResolvedTarget {
	readonly name: string;
	readonly scene: string;
	readonly settings: TargetSettings;
	readonly frames: number | undefined;
	/** Output directory (still config-relative — the caller resolves). */
	readonly outDir: string;
	/** Derived file name: `<name>.<format>` — never user-specified. */
	readonly fileName: string;
}

const definedEntries = (obj: object) =>
	Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/**
 * Precedence, highest wins: CLI flags → target config → library defaults.
 * Library defaults are NOT materialized here — leaving fields undefined
 * lets the Runner's own defaults apply, so there is one source of truth.
 */
export const resolveTarget = (
	target: MotionTarget,
	overrides: RenderOverrides = {},
): ResolvedTarget => {
	const {
		frames: overrideFrames,
		outDir,
		format,
		...settingsOverrides
	} = overrides;
	const settings: TargetSettings = {
		...definedEntries(target.settings ?? {}),
		...definedEntries(settingsOverrides),
	};
	const resolvedFormat = format ?? target.format ?? DEFAULT_FORMAT;
	return {
		name: target.name,
		scene: target.scene,
		settings,
		frames: overrideFrames ?? target.frames,
		outDir: outDir ?? target.output ?? DEFAULT_OUTPUT_DIR,
		fileName: `${target.name}.${resolvedFormat}`,
	};
};
