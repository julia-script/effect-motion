import * as Data from "effect/Data";

/**
 * Every failure mode of the CLI, as a `reason` union on a single tagged
 * error. One type keeps the error channel a single name in every command
 * signature; adding a failure mode is a union-member addition handled
 * exhaustively at exactly one place (the top-level reporter in bin.ts).
 */
export type MotionCliReason =
	| "ConfigNotFound"
	| "ConfigInvalid"
	| "SceneLoadFailed"
	| "UnknownTarget"
	| "ScaffoldTargetNotEmpty"
	| "ScaffoldFailed"
	| "InstallFailed"
	| "RenderFailed"
	| "StudioFailed";

/**
 * The one error type of `@effect-motion/cli`: either wraps an upstream
 * failure (`cause` carries it) or states a custom one. `message` MUST name
 * the offender — the file, target, or path that failed — because it is the
 * only line shown without `--verbose`.
 */
export class MotionCliError extends Data.TaggedError("MotionCliError")<{
	readonly reason: MotionCliReason;
	readonly message: string;
	readonly cause?: unknown;
}> {}

/** Render an error for the terminal: message always, cause chain on verbose. */
export const renderForTerminal = (
	error: MotionCliError,
	verbose: boolean,
): string => {
	const lines = [`error(${error.reason}): ${error.message}`];
	if (verbose) {
		let cause: unknown = error.cause;
		while (cause !== undefined && cause !== null) {
			lines.push(
				`caused by: ${cause instanceof Error ? (cause.stack ?? cause.message) : String(cause)}`,
			);
			cause = cause instanceof Error ? cause.cause : undefined;
		}
	}
	return lines.join("\n");
};
