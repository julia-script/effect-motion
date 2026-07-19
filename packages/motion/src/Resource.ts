import * as Effect from "effect/Effect";
import { EffectMotionError } from "./EffectMotionError.js";

/**
 * The shared loader brand. Every loader service (FontLoader, ImageLoader,
 * future kinds) carries it, and it is the ONLY thing they share: loader
 * shapes stay separate per kind (fonts grow font metadata, images image
 * metadata) so nothing over-abstracts, while the type utilities below are
 * written once against the brand.
 */
export const LoaderTypeId = "~effect-motion/Resources/Loader" as const;

export interface LoaderBrand {
	readonly [LoaderTypeId]: typeof LoaderTypeId;
}

/**
 * The loader members of a requirements union — what a scene's frames carry
 * as `Frame<Resources>` and what `Renderer.render` requires. Distributes:
 * `FontLoader<"a"> | Runner` → `FontLoader<"a">`.
 */
export type ExtractLoaders<R> = R extends LoaderBrand ? R : never;

/**
 * A requirements union with the loader members removed — what running a
 * scene actually needs. Frames are pure of resource bytes (the engine
 * cannot measure text), so `Scene.run`/`stream` require only this.
 */
export type ExcludeLoaders<R> = R extends LoaderBrand ? never : R;

/**
 * Fetch a resource's bytes by URL — the common browser-side load effect for
 * `Font.layer`/`Image.layer`. Fails with a typed error naming the URL, so a
 * bad source surfaces at layer construction (e.g. the player's error
 * state), never at frame time. Compose retries on top as needed.
 */
export const fetchBytes = (
	url: string,
): Effect.Effect<Uint8Array, EffectMotionError> =>
	Effect.tryPromise({
		try: async () => {
			const response = await fetch(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			return new Uint8Array(await response.arrayBuffer());
		},
		catch: (cause) =>
			EffectMotionError.of(`Resource fetch failed: ${url}`, cause),
	});
