import TVG, { type InitOptions } from "@thorvg/webcanvas";
import { Brand, Context, Effect, Layer, Option, Ref, type Scope } from "effect";
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

export const init = (options: InitOptions) =>
	wrapPromise(() =>
		// ponytail: globalThis steal. The shipped wasm is closure-minified — the
		// symbol map (name → single-letter export) lives only inside the glue, which
		// stashes the fully-named module on __ThorVGModule after init. Own the
		// factory (design D5) only if concurrent engines / worker isolation are
		// needed; a single init side-effect doesn't justify a build pipeline.
		TVG.init(options).then(() => {
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
		}),
	);

/**
 * Scoped ThorVG engine: `init` on acquire, `term()` on release. Callers provide a
 * `locateFile` via the Node/browser layers (design D1).
 */
export const make = (options: InitOptions) =>
	Effect.acquireRelease(
		init(options).pipe(
			Effect.map(({ module, threadCount }) =>
				ThorvgWasm.of({ module, threadCount, renderer: "sw" }),
			),
		),
		(service) => wrap(() => service.module.term()).pipe(Effect.ignore),
	);

export const layer = (options: InitOptions) =>
	Layer.effect(ThorvgWasm, make(options));
