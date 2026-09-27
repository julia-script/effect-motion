import * as Cause from "effect/Cause";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import { Flag, GlobalFlag } from "effect/unstable/cli";

// registered globally so `--verbose` parses anywhere on the command line;
// handlers read it with `yield* verboseFlag`, the top-level reporter reads argv
export const verboseFlag = GlobalFlag.Setting("verbose")({
	flag: Flag.Boolean("verbose").pipe(
		Flag.withDefault(false),
		Flag.withDescription("Print full error cause chains"),
	),
});

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
	| "InvalidFrameSelection"
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

/**
 * What actually went wrong, on one line: the squashed cause's name and the
 * first line of its message (e.g. `TypeError: iter.next is not a function`).
 */
export const causeLine = (cause: unknown): string => {
	const error = Cause.isCause(cause) ? Cause.squash(cause) : cause;
	const text =
		error instanceof Error
			? error.message === ""
				? error.name
				: `${error.name}: ${error.message}`
			: String(error);
	return text.split("\n")[0] ?? text;
};

/** The `caused by:` lines of a cause chain, stacks included. */
export const causeChain = (cause: unknown): ReadonlyArray<string> => {
	const lines: Array<string> = [];
	let current: unknown = Cause.isCause(cause) ? Cause.squash(cause) : cause;
	while (current !== undefined && current !== null) {
		lines.push(
			`caused by: ${current instanceof Error ? (current.stack ?? current.message) : String(current)}`,
		);
		current = current instanceof Error ? current.cause : undefined;
	}
	return lines;
};

/**
 * Turn any failure or defect of `self` into a `MotionCliError` whose message
 * ends with the one-line cause; the full chain stays on `cause` for
 * `--verbose`. A `MotionCliError` passes through; interruption is kept.
 */
export const failWithCause =
	(reason: MotionCliReason, message: string) =>
	<A, E, R>(
		self: Effect.Effect<A, E, R>,
	): Effect.Effect<A, MotionCliError, R> =>
		Effect.catchCause(self, (cause) => {
			if (Cause.hasInterruptsOnly(cause)) return Effect.interrupt;
			const error = Cause.squash(cause);
			return Effect.fail(
				error instanceof MotionCliError
					? error
					: new MotionCliError({
							reason,
							message: `${message}: ${causeLine(error)}`,
							cause: error,
						}),
			);
		});

/** Render an error for the terminal: message always, cause chain on verbose. */
export const renderForTerminal = (
	error: MotionCliError,
	verbose: boolean,
): string =>
	[
		`error(${error.reason}): ${error.message}`,
		...(verbose ? causeChain(error.cause) : []),
	].join("\n");
