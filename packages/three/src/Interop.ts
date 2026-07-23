import { Effect } from "effect";
import { ThreeException } from "./ThreeException.js";

/**
 * The seam between three.js and Effect: turning thrown exceptions and
 * rejected promises into typed failures.
 *
 * @remarks
 * Used to wrap the calls that can actually fail — construction, GPU work,
 * async initialization. Per-frame object mutation deliberately does NOT go
 * through here: it cannot fail, and wrapping it would allocate an Effect per
 * property write in a hot loop.
 */

/**
 * Run a synchronous three call, converting a throw into a
 * {@link ThreeException}.
 *
 * @param operation - Name of the three operation, used in the error.
 * @param fn - The call to make.
 */
export const wrap = <A>(operation: string, fn: () => A) =>
	Effect.try({
		try: fn,
		catch: (cause) => new ThreeException({ operation, cause }),
	});

/**
 * Run an async three call, converting a rejection into a
 * {@link ThreeException}.
 *
 * @param operation - Name of the three operation, used in the error.
 * @param fn - The call to make.
 */
export const wrapPromise = <A>(operation: string, fn: () => Promise<A>) =>
	Effect.tryPromise({
		try: fn,
		catch: (cause) => new ThreeException({ operation, cause }),
	});
