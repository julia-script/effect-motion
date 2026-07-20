import { Data } from "effect";

export class ThreeException extends Data.TaggedError("ThreeException")<{
	cause?: unknown;
	/** Name of the three.js operation that failed. */
	operation?: string;
}> {}
