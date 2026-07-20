// Public API: the studio entrypoint contract (imported by user studio.ts
// files and the studio app, so this entry must stay browser-safe) and the
// error type. The commands live behind the `motion` bin, not this entry.
export { MotionCliError, type MotionCliReason } from "./MotionCliError.js";
export {
	type EntriesResources,
	isStudioConfig,
	type PlayerOptions,
	type ResolvedEntry,
	resolveEntries,
	type StudioConfig,
	StudioConfigTypeId,
	type StudioEntry,
	studioConfig,
} from "./StudioConfig.js";
