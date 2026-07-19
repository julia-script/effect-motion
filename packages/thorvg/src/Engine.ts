import TVG, { type InitOptions, type RendererType } from "@thorvg/webcanvas";
import { Context, Effect, Layer, Option, Record } from "effect";
import { get } from "effect/Record";
import { clearLoaded, loadFonts } from "./Font.js";
import { wrap, wrapPromise } from "./Interop.js";
import type { ThorVGModule, TvgCanvasInstance } from "./thorvgemscripten.js";

/**
 * The engine tier: the ThorVG wasm module as an Effect service, its
 * initialization (via the upstream glue's global), and the layers that
 * provide it. Browser and Node layers differ only in how the `.wasm` file is
 * located; the Node layer lives in `EngineNode.ts` so `node:*` imports never
 * reach a browser bundle.
 */

export class ThorvgWasm extends Context.Service<
	ThorvgWasm,
	{
		module: ThorVGModule;
		threadCount: number;
		renderer: "sw" | "webgl" | "webgpu";
	}
>()("ThorvgWasm") {}

// ponytail: globalThis steal. The shipped wasm is closure-minified — the
// symbol map (name → single-letter export) lives only inside the glue, which
// stashes the fully-named module on __ThorVGModule after init. Own the
// factory (design D5) only if concurrent engines / worker isolation are
// needed; a single init side-effect doesn't justify a build pipeline.
const stealGlobal = () => {
	const g = globalThis as Record<string, unknown>;
	const module = get(g, "__ThorVGModule");
	const threadCount = get(g, "__THORVG_THREAD_COUNT");
	if (Option.isSome(module)) {
		return {
			module: module.value as ThorVGModule,
			threadCount: Option.isSome(threadCount)
				? (threadCount.value as number)
				: 1,
		};
	}
	throw new Error("__ThorVGModule not found after TVG.init");
};

export const init = (options: InitOptions) =>
	wrapPromise(() => {
		if (Record.has(globalThis as Record<string, unknown>, "__ThorVGModule")) {
			return Promise.resolve(stealGlobal());
		}

		return TVG.init(options).then(() => {
			return stealGlobal();
		});
	});

/** Our engine options: webcanvas init options plus a family→ttfUrl font map. */
export interface ThorvgOptions extends InitOptions {
	/**
	 * Fonts to load into the engine on acquire, as `family -> TrueType URL`.
	 * Absent or empty loads NO fonts and makes no network request — there is
	 * no implicit default font; the motion render path provides one from
	 * loader services. Per-scene fonts go through the scoped Font registry.
	 */
	readonly fonts?: Record<string, string>;
	/**
	 * `term()` the wasm engine (and delete the keeper canvas) when the last
	 * acquiring scope releases. Node/test isolation wants this; in the browser
	 * the engine is a page-lifetime singleton and release is a no-op (design
	 * D2 — upstream itself only terms on `beforeunload`).
	 */
	readonly termOnRelease?: boolean;
}

// Per-module engine state: how many scopes hold the engine, and the keeper
// canvas pinning ThorVG's refcounted Initializer (design D1). Keyed per module
// (WeakMap) for the same reason as the font registry: an engine recreated
// under HMR starts clean.
interface EngineState {
	refCount: number;
	keeper: TvgCanvasInstance | undefined;
}
const stateByModule = new WeakMap<ThorVGModule, EngineState>();

/**
 * Scoped ThorVG engine acquisition. Acquire is an idempotent process-level
 * singleton: the wasm initializes once (later acquires adopt the module via
 * the glue's global), default fonts load, and a hidden 1×1 keeper canvas is
 * created so ThorVG's refcounted `Initializer` never reaches zero while the
 * engine is held — deleting any working canvas can then never wipe the
 * engine's font table (design D1, verified in the lifetimes tests).
 *
 * Release is refcounted: a no-op while other scopes hold the engine or when
 * `termOnRelease` is unset (browser semantics). With `termOnRelease`, the
 * last release deletes the keeper and runs `term()` (Node/test isolation).
 */
export const make = (options: ThorvgOptions) =>
	Effect.acquireRelease(
		init(options).pipe(
			Effect.tap(({ module }) => {
				const fonts = options.fonts;
				if (fonts === undefined || Object.keys(fonts).length === 0) {
					return Effect.void;
				}
				return wrapPromise(() => loadFonts(module, fonts));
			}),
			Effect.map(({ module, threadCount }) =>
				ThorvgWasm.of({ module, threadCount, renderer: "sw" }),
			),
			Effect.tap((service) =>
				wrap(() => {
					let state = stateByModule.get(service.module);
					if (state === undefined) {
						state = { refCount: 0, keeper: undefined };
						stateByModule.set(service.module, state);
					}
					if (state.keeper === undefined) {
						// the keeper pins Initializer >= 1 for the engine's lifetime
						state.keeper = new service.module.TvgCanvas(
							service.renderer,
							"",
							1,
							1,
						);
					}
					state.refCount++;
				}),
			),
		),
		(service) =>
			wrap(() => {
				const state = stateByModule.get(service.module);
				if (state === undefined) {
					return;
				}
				state.refCount = Math.max(0, state.refCount - 1);
				if (state.refCount === 0 && options.termOnRelease === true) {
					// keeper dies first so Initializer can reach zero, then term();
					// the font-load cache must forget this engine's loads too
					state.keeper?.delete();
					state.keeper = undefined;
					service.module.term();
					clearLoaded(service.module);
				}
			}).pipe(Effect.ignore),
	);

export const layer = (options: ThorvgOptions) =>
	Layer.effect(ThorvgWasm, make(options));

/**
 * Browser ThorVG layer. Only difference from the Node layer is `locateFile`:
 * here the `.wasm` is served from a base URL (bundler asset dir, or an unpkg URL
 * like `https://unpkg.com/@thorvg/webcanvas@1.0.8/dist/`). Same acquire path
 * otherwise (design D1).
 */
export const browserLayer = (
	baseUrl: string,
	renderer: RendererType = "sw",
	fonts?: Record<string, string>,
) =>
	layer({
		renderer,
		locateFile: (file: string) => new URL(file, baseUrl).href,
		...(fonts !== undefined ? { fonts } : {}),
	});
