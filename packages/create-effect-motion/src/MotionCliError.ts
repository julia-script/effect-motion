import * as Data from "effect/Data";

/**
 * Every failure mode of the scaffolder, as a `reason` union on a single
 * tagged error — same pattern as @effect-motion/cli's MotionCliError (a
 * deliberate small copy; the two packages share no code).
 */
export type MotionCliReason =
	| "ScaffoldTargetNotEmpty"
	| "ScaffoldFailed"
	| "InstallFailed";

/**
 * The one error type of `create-effect-motion`: either wraps an upstream
 * failure (`cause` carries it) or states a custom one. `message` MUST name
 * the offender — the directory or command that failed — because it is the
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
