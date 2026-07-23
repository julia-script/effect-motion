import { Data } from "effect";

/**
 * A malformed scene graph, found while walking a frame.
 *
 * @remarks
 * Raised for four situations, each an authoring bug rather than a
 * recoverable condition:
 *
 * - an instance referenced more than once (a duplicate parent, or a cycle);
 * - a reference to an instance id that is not in the frame;
 * - a `Hud` nested inside world content, when it must be a top-level child
 *   of the root or of another Hud;
 * - an entity whose kind has no registered renderer.
 *
 * The message names the offending instance. It arrives as a typed error
 * rather than a thrown exception: the walk itself throws to escape a deep
 * recursion, but that is caught once at the sync seam so callers never see
 * an exception cross an unrelated Effect boundary.
 */
export class RenderException extends Data.TaggedError("RenderException")<{
	readonly message: string;
	readonly cause?: unknown;
}> {
	/** Build the error with a message and an optional underlying cause. */
	static of(message: string, cause?: unknown): RenderException {
		return new RenderException({ message, cause });
	}
}
