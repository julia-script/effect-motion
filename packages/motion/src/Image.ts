import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as Resource from "./Resource.js";
import type { EnsureLiteral } from "./types.js";

export const tag = "effect-motion/Resources/Image" as const;

/**
 * An image reference as entity data stores it: `{ _tag, id }`. Obtain one
 * by yielding an {@link Image} constant inside a scene — that is what puts
 * the matching `ImageLoader<ID>` into the scene's requirements.
 */
export interface Image<ID extends string = string> {
	readonly _tag: typeof tag;
	readonly id: ID;
}

/** The stored-data schema for image references (see `Shapes.Image`). */
export const schema = Schema.TaggedStruct(tag, {
	id: Schema.String,
});

const loaderKeyPrefix = "effect-motion/Resources/ImageLoader/" as const;

/**
 * A loaded image (encoded bytes — png/jpg/webp per the render session's
 * decoder), provided as a context service: bytes are already in memory by
 * the time any consumer reads this (loads run eagerly at layer
 * construction — see {@link layer}). A separate shape from FontLoader on
 * purpose (kind-specific metadata will diverge); only the loader brand is
 * shared.
 */
export interface ImageLoader<ID extends string = string>
	extends Resource.LoaderBrand {
	readonly id: ID;
	readonly bytes: Uint8Array;
}

/** The context key for an image's loader, derived from the id string alone. */
export const Loader = <ID extends string>(
	id: ID,
): Context.Service<ImageLoader<ID>, ImageLoader<ID>> =>
	Context.Service<ImageLoader<ID>>(`${loaderKeyPrefix}${id}`);

/**
 * One image constant, two faces — author side (`yield*` for the value and
 * the phantom `ImageLoader<ID>` requirement) and provider side (`.Loader`
 * plus {@link layer}). See `Font.Font` for the full contract; images follow
 * it exactly.
 */
export interface ImageResource<ID extends string = string>
	extends Effect.Effect<Image<ID>, never, ImageLoader<ID>> {
	readonly id: ID;
	readonly Loader: Context.Service<ImageLoader<ID>, ImageLoader<ID>>;
}

export const Image = <const ID extends string>(
	id: ID & EnsureLiteral<ID, "Image id must be a literal string">,
): ImageResource<ID> => {
	const value: Image<ID> = { _tag: tag, id };
	return Object.assign(Effect.succeed(value), {
		id: id as ID,
		Loader: Loader(id as ID),
	});
};

/**
 * Provide an image's encoded bytes. The load effect runs ONCE, at layer
 * construction — never at frame time; compose retries on the load effect.
 */
export const layer = <ID extends string, E, R>(
	image: ImageResource<ID>,
	load: Effect.Effect<Uint8Array, E, R>,
): Layer.Layer<ImageLoader<ID>, E, R> =>
	Layer.effect(
		image.Loader,
		load.pipe(
			Effect.map(
				(bytes): ImageLoader<ID> => ({
					[Resource.LoaderTypeId]: Resource.LoaderTypeId,
					id: image.id,
					bytes,
				}),
			),
		),
	);
