import { Data } from "effect";

/**
 * A three.js operation failed.
 *
 * @remarks
 * Every fallible call in this package reports through this one error type,
 * so a caller catches by tag rather than guarding each three API
 * separately. `operation` names which call failed — `"WebGPURenderer.init"`,
 * `"readRenderTargetPixelsAsync"` — and `cause` carries whatever three
 * threw or rejected with.
 *
 * Typical causes are environmental rather than logical: no WebGPU adapter,
 * a lost device, a shader that failed to compile.
 */
export class ThreeException extends Data.TaggedError("ThreeException")<{
	/** The underlying error three threw or rejected with. */
	cause?: unknown;
	/** Name of the three.js operation that failed. */
	operation?: string;
}> {}
