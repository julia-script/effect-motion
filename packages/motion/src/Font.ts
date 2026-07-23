import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Resource from "./Resource.js";
import type { EnsureLiteral } from "./types.js";

export const tag = "effect-motion/Resources/Font" as const;

/**
 * A font reference as entity data stores it: `{ _tag, id }`. The id is the
 * family name text paints register and select by. Obtain one by yielding a
 * {@link Font} constant inside a scene — that is what puts the matching
 * `FontLoader<ID>` into the scene's requirements.
 */
export interface Font<ID extends string = string> {
	readonly _tag: typeof tag;
	readonly id: ID;
}

/** The stored-data schema for font references (see `Text.fontFamily`). */
export const schema = Schema.TaggedStruct(tag, {
	id: Schema.String,
});

const loaderKeyPrefix = "effect-motion/Resources/FontLoader/" as const;

/**
 * A loaded font, provided as a context service: bytes are already in memory
 * by the time any consumer reads this (loads run eagerly at layer
 * construction — see {@link layer}). `format` is optional; consumers sniff
 * magic bytes when absent.
 */
export interface FontLoader<ID extends string = string>
	extends Resource.LoaderBrand {
	readonly id: ID;
	readonly bytes: Uint8Array;
	readonly format?: "ttf" | "otf";
}

/**
 * The context key for a font's loader, derived from the id string alone —
 * the bridge over literal erasure: frame data carries only `{ id: string }`,
 * and rebuilding the key from that string resolves the same service the
 * authored constant provides.
 */
export const Loader = <ID extends string>(
	id: ID,
): Context.Service<FontLoader<ID>, FontLoader<ID>> =>
	Context.Service<FontLoader<ID>>(`${loaderKeyPrefix}${id}`);

/**
 * One font constant, two faces:
 *
 * - **author side**: `yield*` it in a scene to get the {@link Font} value for
 *   `fontFamily`, adding `FontLoader<ID>` to the scene's requirements. The
 *   requirement is PHANTOM — the effect succeeds without touching context,
 *   so `Scene.run`/`stream` stay loader-free and only the render path
 *   (the first actual consumer of bytes) demands the loader.
 * - **provider side**: `.Loader` is the context key; pair it with
 *   {@link layer} to provide bytes.
 */
export interface FontResource<ID extends string = string>
	extends Effect.Effect<Font<ID>, never, FontLoader<ID>> {
	readonly id: ID;
	readonly Loader: Context.Service<FontLoader<ID>, FontLoader<ID>>;
}

/**
 * Declare a font your scene uses.
 *
 * @remarks
 * Call it once at module scope to get a constant with two faces: `yield*` it
 * inside a scene to obtain the value for a Text's `fontFamily`, and pair it
 * with {@link layer} to supply the actual bytes when rendering.
 *
 * Yielding the constant is what records the font in the scene's
 * requirements, so a scene that uses a font it was never given fails to
 * typecheck instead of rendering in the wrong face.
 *
 * The id must be a literal string — that literal is what ties the
 * requirement to the provider.
 *
 * @param id - The family name, as a literal string.
 *
 * @example
 * ```typescript
 * const Inter = Font.Font("Inter");
 *
 * const scene = Scene.make(function* () {
 * 	const inter = yield* Inter;
 * 	yield* Scene.instantiate("Text", { text: "hello", fontFamily: inter });
 * });
 * ```
 */
export const Font = <const ID extends string>(
	id: ID & EnsureLiteral<ID, "Font id must be a literal string">,
): FontResource<ID> => {
	const value: Font<ID> = { _tag: tag, id };
	// R is covariant, so the loader-free succeed widens to the phantom
	// FontLoader<ID> requirement without a cast
	return Object.assign(Effect.succeed(value), {
		id: id as ID,
		Loader: Loader(id as ID),
	});
};

/**
 * Provide a font's bytes. The load effect runs ONCE, at layer construction
 * (runtime build) — never at frame time; compose retries/timeouts on the
 * load effect itself. Every provided font loads regardless of whether the
 * scene ends up using it (preload-all-provided policy).
 */
export const layer = <ID extends string, E, R>(
	font: FontResource<ID>,
	load: Effect.Effect<Uint8Array, E, R>,
	options?: { readonly format?: "ttf" | "otf" },
): Layer.Layer<FontLoader<ID>, E, R> =>
	Layer.effect(
		font.Loader,
		load.pipe(
			Effect.map(
				(bytes): FontLoader<ID> => ({
					[Resource.LoaderTypeId]: Resource.LoaderTypeId,
					id: font.id,
					bytes,
					...(options?.format !== undefined ? { format: options.format } : {}),
				}),
			),
		),
	);

/**
 * The built-in default font under the RESERVED id `"sans-serif"` — the
 * `Text.fontFamily` constructor default. It never appears in a scene's
 * requirements (no `yield*` happens for a schema default); the render path
 * auto-provides its loader beneath caller context, so providing your own
 * loader under the `"sans-serif"` id overrides the built-in bytes.
 */
export const defaultFont: FontResource<"sans-serif"> = Font("sans-serif");
export { defaultFont as default };

/**
 * A CORS-open, static-weight TrueType mapped to the default family. Lived
 * on the render engine before this refactor; now the render path fetches it
 * (module-cached) only when a frame actually uses the default font and no
 * caller-provided `"sans-serif"` loader is in context.
 */
export const DEFAULT_FONT_URL =
	"https://cdn.jsdelivr.net/npm/@expo-google-fonts/inter@0.2.3/Inter_400Regular.ttf";

// immutable bytes, fetched at most once per process — the default font must
// not refetch per render call
let defaultBytesCache: Promise<Uint8Array> | undefined;
export const loadDefaultBytes: Effect.Effect<Uint8Array> = Effect.promise(
	() => {
		defaultBytesCache ??= fetch(DEFAULT_FONT_URL).then(async (response) => {
			if (!response.ok) {
				defaultBytesCache = undefined;
				throw new Error(
					`default font fetch failed (HTTP ${response.status}): ${DEFAULT_FONT_URL}`,
				);
			}
			return new Uint8Array(await response.arrayBuffer());
		});
		return defaultBytesCache;
	},
);
