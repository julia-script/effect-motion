import { Data } from "effect";

/**
 * A scene-graph violation found while walking a frame: an instance
 * referenced twice (duplicate parent or cycle), an unknown instance id, a
 * Hud nested inside world content, or a leaf whose entity has no
 * registered renderer.
 *
 * These are authoring bugs, not recoverable conditions — but they are
 * discovered inside a recursive walk, where threading a result type
 * through every frame would mean checking and re-propagating at each
 * level for a case that always aborts. The walk therefore throws to
 * escape, and the public seam catches once and maps to this error, so
 * callers still see a typed channel rather than an exception crossing an
 * unrelated Effect boundary.
 */
export class RenderException extends Data.TaggedError("RenderException")<{
	readonly message: string;
	readonly cause?: unknown;
}> {
	static of(message: string, cause?: unknown): RenderException {
		return new RenderException({ message, cause });
	}
}
