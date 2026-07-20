import { Effect } from "effect";
import { ThreeException } from "./ThreeException.js";

/**
 * Effect lives at the seams — construction/disposal, async boundaries, and
 * failures. Per-frame object mutation stays raw three; nothing here wraps
 * per-object mutation.
 */

export const wrap = <A>(operation: string, fn: () => A) =>
	Effect.try({
		try: fn,
		catch: (cause) => new ThreeException({ operation, cause }),
	});

export const wrapPromise = <A>(operation: string, fn: () => Promise<A>) =>
	Effect.tryPromise({
		try: fn,
		catch: (cause) => new ThreeException({ operation, cause }),
	});
