import {
	type ThorvgException,
	type ThorvgWasm,
	ThorvgWasmBrowser,
} from "@effect-motion/thorvg";
import { ManagedRuntime } from "effect";

/**
 * The default location the ThorVG `.wasm` is fetched from — pinned to the
 * `@thorvg/webcanvas` version this workspace depends on so the glue's symbol
 * map matches the wasm. A player works with zero config against this; a
 * consumer serving the asset locally (or offline / CSP-restricted) overrides
 * it with the `wasmBaseUrl` option.
 *
 * ponytail: this version MUST track the `@thorvg/webcanvas` pin in
 * packages/thorvg/package.json — a mismatch loads a wasm whose minified symbol
 * map differs from its glue, which is a loud init failure (not a silent wrong
 * render). Bump both together.
 */
export const DEFAULT_WASM_BASE =
	"https://unpkg.com/@thorvg/webcanvas@1.0.8/dist/";

// ponytail: one process-global ThorVG engine (the runtime layer steals a single
// `globalThis.__ThorVGModule`, so two concurrent inits race). A shared
// ManagedRuntime acquires the engine lazily on first use and reuses that one
// instance for every player and every frame — the "shared runtime, cached
// instance" model. First caller's baseUrl wins, since the engine is global; a
// second player with a different URL is a no-op on location (one page → one
// wasm). Never released to React: the engine outlives individual players by
// design, like a GPU context. `dispose()` is available if a host wants full
// teardown.
let runtime: ManagedRuntime.ManagedRuntime<ThorvgWasm, ThorvgException> | null =
	null;

/** The shared ThorVG runtime, built lazily on first use. */
export const getRuntime = (
	wasmBaseUrl: string = DEFAULT_WASM_BASE,
): ManagedRuntime.ManagedRuntime<ThorvgWasm, ThorvgException> => {
	if (runtime === null) {
		runtime = ManagedRuntime.make(ThorvgWasmBrowser.layer(wasmBaseUrl));
	}
	return runtime;
};
