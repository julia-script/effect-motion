import TVG, { type InitOptions } from "@thorvg/webcanvas";
import {
	Brand,
	Context,
	Effect,
	Layer,
	Option,
	Record,
	Ref,
	type Scope,
} from "effect";
import { get } from "effect/Record";
import { messageForCode, ThorvgException } from "./ThorvgException";
import type { ThorVGModule } from "./thorvgemscripten";

// ponytail: raw pointers only. Never wrap a ThorVG pointer in a @thorvg/webcanvas
// Paint/Shape/etc. object — those register with a FinalizationRegistry and would
// race this API's Scope-based frees (design D6).
export type Ptr = number & Brand.Brand<"ThorvgPtr">;
export const Ptr = Brand.nominal<Ptr>();

export class ThorvgWasm extends Context.Service<
	ThorvgWasm,
	{
		module: ThorVGModule;
		threadCount: number;
		renderer: "sw" | "webgl" | "webgpu";
	}
>()("ThorvgWasm") {}

export const wrap = <A>(fn: () => A) =>
	Effect.try({
		try: fn,
		catch: (error) => new ThorvgException({ cause: error }),
	});

export const wrapPromise = <A>(fn: () => Promise<A>) =>
	Effect.tryPromise({
		try: fn,
		catch: (error) => new ThorvgException({ cause: error }),
	});

/**
 * Run a C-API call that returns a ThorVG result code (0 = success). A non-zero
 * code becomes a typed failure naming the operation (design D3).
 */
export const checked = (operation: string, fn: () => number) =>
	wrap(fn).pipe(
		Effect.flatMap((code) =>
			code === 0
				? Effect.void
				: Effect.fail(
						new ThorvgException({
							code,
							operation,
							cause: `${operation} failed: ${messageForCode(code)}`,
						}),
					),
		),
	);

/**
 * Run a C-API constructor that returns a pointer. A null (0) pointer is a
 * failure; a non-null pointer is branded (design D3).
 */
export const checkedPtr = (operation: string, fn: () => number) =>
	wrap(fn).pipe(
		Effect.flatMap((ptr) =>
			ptr === 0
				? Effect.fail(
						new ThorvgException({
							operation,
							cause: `${operation} returned null`,
						}),
					)
				: Effect.succeed(Ptr(ptr)),
		),
	);

/** A paint whose lifetime the Scope owns until it is `add`ed to a parent. */
export interface OwnedPaint {
	readonly ptr: Ptr;
	/** true while the Scope owns the free; `add` flips this to false (design D2). */
	readonly owned: Ref.Ref<boolean>;
}

/**
 * acquireRelease for a ThorVG paint. The finalizer frees the paint only while it
 * is still owned by the Scope — `add` transfers ownership to a parent, which then
 * frees the whole subtree (ThorVG parent-owns-child, design D2).
 */
export const acquirePaint = (
	operation: string,
	create: (m: ThorVGModule) => number,
	free: (m: ThorVGModule, ptr: Ptr) => void,
): Effect.Effect<OwnedPaint, ThorvgException, ThorvgWasm | Scope.Scope> =>
	Effect.gen(function* () {
		const { module } = yield* ThorvgWasm;
		const ptr = yield* checkedPtr(operation, () => create(module));
		const owned = yield* Ref.make(true);
		yield* Effect.addFinalizer(() =>
			Ref.get(owned).pipe(
				Effect.flatMap((stillOwned) =>
					stillOwned
						? wrap(() => free(module, ptr)).pipe(Effect.ignore)
						: Effect.void,
				),
			),
		);
		return { ptr, owned };
	});

/** Default paint free: unref with the free flag set (design D2). */
export const freePaint = (m: ThorVGModule, ptr: Ptr): void => {
	m._tvg_paint_unref(ptr, 1);
};

/**
 * acquireRelease scratch memory (design D4). The malloc'd block is freed on scope
 * close, even under interruption. Typed views are derived from `HEAPU8.buffer`
 * because only HEAPU8/HEAPF32 are exposed on the module.
 */
export const withScratch =
	(byteLength: number) =>
	<A, E, R>(
		use: (scratch: Scratch) => Effect.Effect<A, E, R>,
	): Effect.Effect<A, E | ThorvgException, R | ThorvgWasm> =>
		Effect.gen(function* () {
			const { module } = yield* ThorvgWasm;
			const ptr = yield* Effect.acquireRelease(
				checkedPtr("_malloc", () => module._malloc(byteLength)),
				(p) => wrap(() => module._free(p)).pipe(Effect.ignore),
			);
			return yield* use(new Scratch(module, ptr, byteLength));
		}).pipe(Effect.scoped);

/** Typed read/write access into a malloc'd scratch block. */
export class Scratch {
	constructor(
		readonly module: ThorVGModule,
		readonly ptr: Ptr,
		readonly byteLength: number,
	) {}

	private view(): DataView {
		return new DataView(this.module.HEAPU8.buffer, this.ptr, this.byteLength);
	}

	readF32(offset = 0): number {
		return this.view().getFloat32(offset, true);
	}
	writeF32(offset: number, value: number): void {
		this.view().setFloat32(offset, value, true);
	}
	readU32(offset = 0): number {
		return this.view().getUint32(offset, true);
	}
	writeU32(offset: number, value: number): void {
		this.view().setUint32(offset, value, true);
	}
	readF32Array(count: number): Float32Array {
		return new Float32Array(
			this.module.HEAPU8.buffer.slice(this.ptr, this.ptr + count * 4),
		);
	}
	writeBytes(bytes: Uint8Array, offset = 0): void {
		this.module.HEAPU8.set(bytes, this.ptr + offset);
	}
}

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

/**
 * The default font: a CORS-open, static-weight TrueType served by jsdelivr,
 * mapped to the family `Text` defaults to (`sans-serif`). Text renders with no
 * config; a consumer overrides this URL or adds families via `options.fonts`.
 * ponytail: a network fetch at engine acquire — pass an empty `fonts` map (or
 * your own) for offline/CSP environments. Must resolve to TTF bytes (verified:
 * Inter 400 loads into ThorVG and renders glyphs).
 */
export const DEFAULT_FONT_URL =
	"https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf";

/** Our engine options: webcanvas init options plus a family→ttfUrl font map. */
export interface ThorvgOptions extends InitOptions {
	/**
	 * Fonts to load into the engine on acquire, as `family -> TrueType URL`.
	 * Defaults to the single default sans (see {@link DEFAULT_FONT_URL}). An
	 * empty object loads no fonts (text then has no glyphs). Merged, not
	 * replaced — the default family is present unless overridden.
	 */
	readonly fonts?: Record<string, string>;
}

// Fonts loaded into a given engine module, so a repeat load — a second player,
// or a re-mount after SPA navigation — skips the fetch. Keyed PER MODULE (a
// WeakMap): if the engine is recreated (e.g. HMR, a new runtime) the new module
// starts with an empty set, so the cache can't desync from the actual engine.
// The inner set keys on "family\0url" so overriding a family's url reloads it.
const loadedByModule = new WeakMap<ThorVGModule, Set<string>>();

const loadedSet = (module: ThorVGModule): Set<string> => {
	let s = loadedByModule.get(module);
	if (s === undefined) {
		s = new Set();
		loadedByModule.set(module, s);
	}
	return s;
};

// Fetch a family's TTF and load it into the engine. A failed fetch/load is a
// logged skip, never a hard error (design D2). `fetch` is global in Node ≥18
// and the browser — one code path. A (family,url) already loaded INTO THIS
// module is a no-op.
const loadFontIntoModule = (
	module: ThorVGModule,
	family: string,
	url: string,
): Promise<void> => {
	const loaded = loadedSet(module);
	const key = `${family}\0${url}`;
	if (loaded.has(key)) {
		return Promise.resolve();
	}
	return fetch(url)
		.then((r) => {
			if (!r.ok) {
				throw new Error(`HTTP ${r.status}`);
			}
			return r.arrayBuffer();
		})
		.then((buf) => {
			const bytes = new Uint8Array(buf);
			const enc = new TextEncoder();
			const nameB = enc.encode(`${family}\0`);
			const mimeB = enc.encode("ttf\0");
			const total = nameB.length + mimeB.length + bytes.length;
			const ptr = module._malloc(total);
			try {
				module.HEAPU8.set(nameB, ptr);
				module.HEAPU8.set(mimeB, ptr + nameB.length);
				module.HEAPU8.set(bytes, ptr + nameB.length + mimeB.length);
				const rc = module._tvg_font_load_data(
					ptr,
					ptr + nameB.length + mimeB.length,
					bytes.length,
					ptr + nameB.length,
					1,
				);
				if (rc !== 0) {
					throw new Error(`_tvg_font_load_data rc ${rc}`);
				}
				loaded.add(key);
			} finally {
				module._free(ptr);
			}
		})
		.catch((err) => {
			console.warn(
				`@effect-motion/thorvg: font "${family}" failed to load from ${url}`,
				err,
			);
		});
};

const loadFonts = (
	module: ThorVGModule,
	fonts: Record<string, string>,
): Promise<void> =>
	Promise.all(
		Object.entries(fonts).map(([family, url]) =>
			loadFontIntoModule(module, family, url),
		),
	).then(() => undefined);

/**
 * Scoped ThorVG engine: `init` on acquire (then load fonts), `term()` on
 * release. Callers provide a `locateFile` via the Node/browser layers (design
 * D1) and optionally a `fonts` map (design D2); the default sans loads unless
 * overridden.
 */
export const make = (options: ThorvgOptions) =>
	Effect.acquireRelease(
		init(options).pipe(
			Effect.tap(({ module }) => {
				const fonts = options.fonts ?? { "sans-serif": DEFAULT_FONT_URL };
				return wrapPromise(() => loadFonts(module, fonts));
			}),
			Effect.map(({ module, threadCount }) =>
				ThorvgWasm.of({ module, threadCount, renderer: "sw" }),
			),
		),
		(service) => wrap(() => service.module.term()).pipe(Effect.ignore),
	);

export const layer = (options: ThorvgOptions) =>
	Layer.effect(ThorvgWasm, make(options));

/**
 * Load fonts into the ALREADY-ACQUIRED engine on demand (family → TrueType
 * URL). Idempotent: a family+url already loaded is skipped. Use this when the
 * fonts a scene needs aren't known at engine-acquire time — e.g. the engine is
 * a process-global singleton (shared across players / SPA navigations) and a
 * later scene declares fonts the first acquire didn't load. A failed
 * fetch/load for one family is a logged skip, not a failure.
 */
export const loadFontsIntoEngine = (
	fonts: Record<string, string>,
): Effect.Effect<void, never, ThorvgWasm> =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			Effect.promise(() => loadFonts(module, fonts)),
		),
	);
