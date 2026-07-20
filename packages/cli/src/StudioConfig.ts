import type { PlayerProps } from "@effect-motion/react";
import type * as Layer from "effect/Layer";
import * as Scene from "effect-motion/Scene";
import { MotionCliError } from "./MotionCliError.js";

/**
 * The `studio.ts` contract. This module is intentionally browser-safe (the
 * studio app imports the user's entrypoint — and this module's helpers —
 * directly), so it must stay free of Node-only imports.
 *
 * A studio entrypoint default-exports `studioConfig({ scenes, layers })`:
 * a RECORD of scenes (keys are the unique picker identifiers) and ONE
 * `layers` covering the union of every registered scene's resource
 * requirements. The record is the registration — there is no glob; every
 * scene lives in this file's import graph, which is what makes plain Vite
 * HMR cover scene add/edit/remove.
 */

export const StudioConfigTypeId = "~effect-motion/cli/StudioConfig" as const;

/**
 * The `PlayerProps` preview subset a studio entry may set — typed against
 * the REAL props (no hand-copied mirror): drift in the Player's API is a
 * compile error here, not a silent mismatch.
 */
export type PlayerOptions = Pick<
	PlayerProps,
	| "fps"
	| "autoPlay"
	| "defaultRepeatMode"
	| "isInfinite"
	| "prebufferedFrames"
	| "bufferCapacity"
	| "settings"
>;

/** A registration: a bare scene, or a scene with per-entry player options. */
export type StudioEntry =
	| Scene.AnyScene
	| ({ readonly scene: Scene.AnyScene } & PlayerOptions);

type EntryScene<V> = V extends { readonly scene: infer S } ? S : V;

/**
 * The union of loader requirements across every registered scene —
 * `Scene.Resources` distributes over the record's value union, so one
 * `layers` field covers the whole studio (preload-all-provided,
 * studio-wide: switching scenes never waits on a fetch).
 */
export type EntriesResources<Entries extends Record<string, StudioEntry>> =
	Scene.Resources<Extract<EntryScene<Entries[keyof Entries]>, Scene.AnyScene>>;

export interface StudioConfig {
	readonly [StudioConfigTypeId]: typeof StudioConfigTypeId;
	readonly scenes: Record<string, StudioEntry>;
	readonly layers?: Layer.Layer<never, unknown, never>;
}

/**
 * Identity helper that types (and brands) a `studio.ts` default export.
 * `layers` is REQUIRED when any registered scene carries loader
 * requirements — a registered scene whose loader is missing from `layers`
 * fails compilation naming the loader — and FORBIDDEN when none do.
 */
export const studioConfig = <const Entries extends Record<string, StudioEntry>>(
	config: { readonly scenes: Entries } & ([EntriesResources<Entries>] extends [
		never,
	]
		? { readonly layers?: never }
		: {
				readonly layers: Layer.Layer<EntriesResources<Entries>, unknown, never>;
			}),
): StudioConfig =>
	({
		[StudioConfigTypeId]: StudioConfigTypeId,
		...config,
	}) as StudioConfig;

/** A normalized entry, ready for the studio picker. */
export interface ResolvedEntry {
	/** the record key — the entry's unique identity */
	readonly key: string;
	/** picker label: the scene's display name, else the key */
	readonly label: string;
	readonly scene: Scene.AnyScene;
	readonly options: PlayerOptions;
}

const isScene = (value: unknown): value is Scene.AnyScene =>
	typeof value === "object" && value !== null && Scene.TypeId in value;

export const isStudioConfig = (value: unknown): value is StudioConfig =>
	typeof value === "object" && value !== null && StudioConfigTypeId in value;

/**
 * Validate a loaded entrypoint's default export and normalize its entries.
 * Guards the untyped escape hatches (JS entrypoints, `as any`) — errors
 * name the file and the offending key.
 */
export const resolveEntries = (
	value: unknown,
	filePath: string,
): ReadonlyArray<ResolvedEntry> => {
	const fail = (problem: string): never => {
		throw new MotionCliError({
			reason: "ConfigInvalid",
			message: `${filePath}: ${problem}`,
		});
	};
	if (!isStudioConfig(value)) {
		return fail(
			"default export is not a studio config (did you forget `export default studioConfig({ scenes: { ... } })`?)",
		);
	}
	if (typeof value.scenes !== "object" || value.scenes === null) {
		return fail("studio config has no `scenes` record");
	}
	const entries: ResolvedEntry[] = [];
	for (const [key, entry] of Object.entries(value.scenes)) {
		if (isScene(entry)) {
			entries.push({
				key,
				label: entry.name ?? key,
				scene: entry,
				options: {},
			});
			continue;
		}
		if (
			typeof entry === "object" &&
			entry !== null &&
			"scene" in entry &&
			isScene(entry.scene)
		) {
			const { scene, ...options } = entry;
			entries.push({
				key,
				label: scene.name ?? key,
				scene,
				options: options as PlayerOptions,
			});
			continue;
		}
		return fail(
			`scenes["${key}"] is neither a scene nor a \`{ scene, ...playerOptions }\` entry`,
		);
	}
	if (entries.length === 0) {
		return fail("studio config registers no scenes");
	}
	return entries;
};
