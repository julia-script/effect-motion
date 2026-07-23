import { Data } from "effect";

/**
 * The library's error type, raised when something outside the engine fails.
 *
 * @remarks
 * Used at the boundaries where the outside world can go wrong — fetching a
 * font, decoding an image, talking to the GPU. Because it is a tagged error,
 * it appears in an Effect's error channel and can be caught by tag, rather
 * than thrown.
 *
 * Author mistakes inside a scene are deliberately NOT this: animating a
 * field that has no value, or orbiting without a point of interest, fail
 * loudly as defects, because they are bugs to fix rather than conditions to
 * handle.
 *
 * `cause` carries the underlying failure when there is one.
 */
export class EffectMotionError extends Data.TaggedError("EffectMotionError")<{
	readonly message: string;
	readonly cause: unknown;
}> {
	/** Build an error with a message and an optional underlying cause. */
	static of(message: string, cause?: unknown): EffectMotionError {
		return new EffectMotionError({ message, cause });
	}
}
