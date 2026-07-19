import { Effect, type Scope } from "effect";
import { ThorvgWasm } from "./Engine.js";
import { checked, cstr, withCstr, withScratch } from "./Interop.js";
import { ThorvgException } from "./ThorvgException.js";
import type { ThorVGModule } from "./thorvgemscripten.js";

/**
 * Engine-level font loading. Fonts are engine-global (not paints): text
 * paints reference a loaded family by name via `Text.setFont`. Two layers:
 *
 * - the engine DEFAULT (`loadFonts`, engine-acquire path): loaded once, lives
 *   for the engine's lifetime, plain per-module dedup;
 * - the scoped REGISTRY (`scoped`/`scopedMany`, session path): refcounted per
 *   family — loaded when the first holder acquires, unloaded from the engine
 *   when the last holder releases (design D4).
 */

/** Font formats ThorVG's loader dispatch accepts (both route to the Sfnt loader). */
export type FontFormat = "ttf" | "otf";

/**
 * Sniff a font file's format from its magic bytes: `OTTO` marks a CFF-flavored
 * OpenType file; everything else (including `\0\1\0\0` TrueType and
 * TrueType-flavored .otf) loads as `ttf`.
 */
export const sniffFormat = (bytes: Uint8Array): FontFormat =>
	bytes[0] === 0x4f &&
	bytes[1] === 0x54 &&
	bytes[2] === 0x54 &&
	bytes[3] === 0x4f
		? "otf"
		: "ttf";

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

/**
 * Load a font into the engine from bytes, under `name`. Text paints reference
 * it via `Text.setFont`. The format defaults to sniffing the magic bytes
 * (design D4); pass `format` to override. `copy = 1`, so ThorVG owns its copy
 * and the scratch frees on scope close. This is the raw engine-lifetime load —
 * for session-scoped (refcounted) loading use {@link scoped}.
 */
export const loadData = (
	name: string,
	bytes: Uint8Array,
	format?: FontFormat,
) => {
	const nameB = cstr(name);
	const mimeB = cstr(format ?? sniffFormat(bytes));
	// pack [name\0][mime\0][data] in one block; pass offset pointers
	return withScratch(nameB.length + mimeB.length + bytes.length)((s) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) => {
				s.writeBytes(nameB, 0);
				s.writeBytes(mimeB, nameB.length);
				s.writeBytes(bytes, nameB.length + mimeB.length);
				return checked("_tvg_font_load_data", () =>
					module._tvg_font_load_data(
						s.ptr,
						s.ptr + nameB.length + mimeB.length,
						bytes.length,
						s.ptr + nameB.length,
						1,
					),
				);
			}),
		),
	);
};

/**
 * Unload a named font from the engine. NOTE: the current wasm build refuses
 * this for data-loaded fonts (`NotSupported`, code 5 — verified by probe);
 * it exists for file-loaded fonts and future builds. The scoped registry
 * calls it best-effort and tombstones the family when the engine refuses.
 */
export const unload = (name: string) =>
	withCstr("_tvg_font_unload", name, (m, ptr) => m._tvg_font_unload(ptr));

// Fonts loaded into a given engine module, so a repeat load — a second player,
// or a re-mount after SPA navigation — skips the fetch. Keyed PER MODULE (a
// WeakMap): if the engine is recreated (e.g. HMR, a new runtime) the new module
// starts with an empty set, so the cache can't desync from the actual engine.
// The inner set keys on "family\0url" so overriding a family's url reloads it.
const loadedByModule = new WeakMap<ThorVGModule, Set<string>>();

/**
 * Forget everything loaded into `module`. Called by the engine release when it
 * `term()`s: the module OBJECT survives (the glue's global), but the engine's
 * font table does not — without this, a later acquire would skip loads the
 * engine no longer has.
 */
export const clearLoaded = (module: ThorVGModule): void => {
	loadedByModule.delete(module);
	registryByModule.delete(module);
};

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
			const nameB = cstr(family);
			const mimeB = cstr("ttf");
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

/** Load a `family -> url` map into a module (engine-acquire path). */
export const loadFonts = (
	module: ThorVGModule,
	fonts: Record<string, string>,
): Promise<void> =>
	Promise.all(
		Object.entries(fonts).map(([family, url]) =>
			loadFontIntoModule(module, family, url),
		),
	).then(() => undefined);

// ─── Scoped registry (design D4) ─────────────────────────────────────────────
// Refcounted per (module, family). A session holds its fonts for its lifetime;
// the engine unloads a family when its last holder releases. Keyed per module
// (WeakMap) so an engine recreated under HMR starts clean.

/** Where a scoped font's bytes come from: a URL to fetch, or the bytes themselves. */
export interface FontSource {
	readonly url?: string;
	readonly bytes?: Uint8Array;
	/** Override the sniffed format. */
	readonly format?: FontFormat;
}

interface RegistryEntry {
	count: number;
	/** identity of the source that loaded this family — conflicts fail loudly */
	sourceKey: string;
	/**
	 * true while the engine holds the font bytes. Stays true at count 0 when
	 * the engine refuses to unload (this wasm returns NotSupported for
	 * data-loaded fonts — verified by probe): the entry then acts as a
	 * tombstone, so a re-acquire skips the re-upload and a different source
	 * claiming the family still conflicts (the old bytes still win).
	 */
	loaded: boolean;
}

const registryByModule = new WeakMap<
	ThorVGModule,
	Map<string, RegistryEntry>
>();

const registryOf = (module: ThorVGModule): Map<string, RegistryEntry> => {
	let r = registryByModule.get(module);
	if (r === undefined) {
		r = new Map();
		registryByModule.set(module, r);
	}
	return r;
};

// cheap stable identity for bytes sources (djb2) — only used to detect two
// DIFFERENT byte blobs claiming the same family
const hashBytes = (bytes: Uint8Array): string => {
	let h = 5381;
	for (let i = 0; i < bytes.length; i++) {
		h = ((h << 5) + h + (bytes[i] ?? 0)) | 0;
	}
	return `bytes:${bytes.length}:${h >>> 0}`;
};

const sourceKeyOf = (source: FontSource): string =>
	source.url ??
	(source.bytes !== undefined ? hashBytes(source.bytes) : "empty");

// unload without needing the service in the finalizer environment: the module
// is captured at acquire time. Returns the ThorVG result code (0 = the engine
// actually released the font; 5/NotSupported = data-loaded fonts can't unload
// in this wasm build).
const rawUnload = (module: ThorVGModule, family: string): number => {
	const nameB = cstr(family);
	const ptr = module._malloc(nameB.length);
	try {
		module.HEAPU8.set(nameB, ptr);
		return module._tvg_font_unload(ptr);
	} finally {
		module._free(ptr);
	}
};

/**
 * Hold `family` for the current Scope (design D4). The first holder loads the
 * font into the engine (fetching `source.url` if bytes aren't provided);
 * later holders share it. Releasing decrements; the LAST release unloads the
 * family from the engine.
 *
 * Failure semantics per the thorvg-fonts spec: a fetch/load failure is a
 * logged skip (resolves `false`, nothing held — that family simply has no
 * glyphs). The one loud failure is a CONFLICT: the family is already held
 * from a different source, which fails with a `ThorvgException` naming both.
 *
 * Resolves `true` when the family is held (loaded or shared).
 */
export const scoped = (
	family: string,
	source: FontSource,
): Effect.Effect<boolean, ThorvgException, ThorvgWasm | Scope.Scope> =>
	Effect.gen(function* () {
		const { module } = yield* ThorvgWasm;
		const registry = registryOf(module);
		const sourceKey = sourceKeyOf(source);

		const holdFinalizer = Effect.sync(() => {
			const entry = registry.get(family);
			if (entry === undefined) {
				return;
			}
			entry.count--;
			if (entry.count <= 0) {
				// best-effort engine unload. rc 0: the engine released the font —
				// drop the entry so a future acquire re-loads. Any other rc (this
				// wasm returns NotSupported for data-loaded fonts): the bytes stay
				// in the engine, so keep the entry as a tombstone — re-acquires
				// skip the upload and conflicting sources stay blocked.
				let rc: number;
				try {
					rc = rawUnload(module, family);
				} catch {
					rc = -1; // wiped engine (post-term); clearLoaded resets the registry
				}
				if (rc === 0) {
					registry.delete(family);
				} else {
					entry.count = 0;
				}
			}
		});

		const existing = registry.get(family);
		if (existing !== undefined) {
			if (existing.sourceKey !== sourceKey) {
				return yield* Effect.fail(
					new ThorvgException({
						operation: "Font.scoped",
						cause:
							`font family "${family}" is already loaded from ${existing.sourceKey}; ` +
							`conflicting source ${sourceKey}` +
							(existing.count === 0
								? " (the engine cannot unload data-loaded fonts, so the earlier load still wins)"
								: ""),
					}),
				);
			}
			existing.count++;
			yield* Effect.addFinalizer(() => holdFinalizer);
			return true;
		}

		// first holder: obtain bytes (fetch is a soft failure — logged skip)
		let bytes = source.bytes;
		if (bytes === undefined && source.url !== undefined) {
			const url = source.url;
			bytes = yield* Effect.promise(() =>
				fetch(url)
					.then((r) => {
						if (!r.ok) {
							throw new Error(`HTTP ${r.status}`);
						}
						return r.arrayBuffer();
					})
					.then((buf) => new Uint8Array(buf))
					.catch((err) => {
						console.warn(
							`@effect-motion/thorvg: font "${family}" failed to fetch from ${url}`,
							err,
						);
						return undefined;
					}),
			);
		}
		if (bytes === undefined) {
			return false;
		}

		// engine load is also a soft failure (invalid font data = logged skip)
		const loaded = yield* Effect.result(
			loadData(family, bytes, source.format ?? sniffFormat(bytes)),
		);
		if (loaded._tag === "Failure") {
			console.warn(
				`@effect-motion/thorvg: font "${family}" failed to load into the engine`,
				loaded.failure,
			);
			return false;
		}

		registry.set(family, { count: 1, sourceKey, loaded: true });
		yield* Effect.addFinalizer(() => holdFinalizer);
		return true;
	});

/**
 * Hold a `family -> url` map for the current Scope (the session path —
 * `Fonts.urlMap(scene)` plugs in here). Families load concurrently;
 * individual failures are logged skips, conflicts fail loudly.
 */
export const scopedMany = (
	fonts: Record<string, string>,
): Effect.Effect<void, ThorvgException, ThorvgWasm | Scope.Scope> =>
	Effect.forEach(
		Object.entries(fonts),
		([family, url]) => scoped(family, { url }),
		{ concurrency: "unbounded", discard: true },
	);
