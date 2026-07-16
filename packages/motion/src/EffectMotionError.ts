import { Data } from "effect";

export class EffectMotionError extends Data.TaggedError("EffectMotionError")<{
	readonly message: string;
	readonly cause: unknown;
}> {
	static of(message: string, cause?: unknown): EffectMotionError {
		return new EffectMotionError({ message, cause });
	}
}
