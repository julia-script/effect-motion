// Public API: the config contract (imported by user motion.config.ts files
// and the studio app, so this entry must stay browser-safe) and the error
// type. The commands live behind the `motion` bin, not this entry.
export {
	DEFAULT_FORMAT,
	DEFAULT_OUTPUT_DIR,
	defineConfig,
	type MotionConfig,
	type MotionTarget,
	type OutputFormat,
	type RenderOverrides,
	type ResolvedTarget,
	resolveTarget,
	type TargetSettings,
	validateConfig,
} from "./Config.js";
export { MotionCliError, type MotionCliReason } from "./MotionCliError.js";
