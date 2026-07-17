import { Effect } from "effect";
import { ThorvgWasm } from "./Engine";
import {
	acquirePaint,
	checked,
	cstr,
	freePaint,
	type OwnedPaint,
	type Scratch,
	withScratch,
} from "./Interop";
import type { ThorvgException } from "./ThorvgException";

/**
 * Pictures: encoded images (png/jpg/webp), vectors (svg), and Lottie data
 * loaded into a paint (design D5). All loaders are compiled into the shipped
 * wasm (`-Dloaders=all`). Decoded data is paint-tier: the picture paint owns
 * it, ownership transfers to the parent on add, and a detached picture is
 * freed by its scope finalizer — no session- or engine-level registry.
 */

/** Encoded formats the engine's loader dispatch accepts (see tvgLoaderMgr). */
export type MimeType = "svg" | "png" | "jpg" | "jpeg" | "webp" | "lot";

/**
 * Raw-buffer color spaces (Tvg_Colorspace). Names describe the u32 channel
 * layout, so on little-endian wasm the BYTE order is reversed: ABGR8888S is
 * `[R,G,B,A]` bytes — the same layout the SW canvas renders out.
 */
export const ColorSpace = {
	/** alpha-premultiplied, bytes [R,G,B,A] */
	ABGR8888: 0,
	/** alpha-premultiplied, bytes [B,G,R,A] */
	ARGB8888: 1,
	/** straight (un-premultiplied), bytes [R,G,B,A] */
	ABGR8888S: 2,
	/** straight (un-premultiplied), bytes [B,G,R,A] */
	ARGB8888S: 3,
} as const;
export type ColorSpace = (typeof ColorSpace)[keyof typeof ColorSpace];

export const make = () =>
	acquirePaint("_tvg_picture_new", (m) => m._tvg_picture_new(), freePaint);

/**
 * Load encoded data (bytes; encode SVG text with `TextEncoder` first) into a
 * picture. `type` is the engine's loader hint — omit it to let the engine
 * sniff the content. `copy = 1`, so the engine owns its copy and the scratch
 * frees on scope close. Unsupported data fails loudly with the result code.
 */
export const load = (
	picture: OwnedPaint,
	bytes: Uint8Array,
	options?: { readonly type?: MimeType },
): Effect.Effect<void, ThorvgException, ThorvgWasm> => {
	const mimeB = options?.type !== undefined ? cstr(options.type) : undefined;
	const mimeLength = mimeB?.length ?? 0;
	return withScratch(bytes.length + mimeLength)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) => {
				s.writeBytes(bytes, 0);
				if (mimeB !== undefined) {
					s.writeBytes(mimeB, bytes.length);
				}
				return checked("_tvg_picture_load_data", () =>
					module._tvg_picture_load_data(
						picture.ptr,
						s.ptr,
						bytes.length,
						mimeB !== undefined ? s.ptr + bytes.length : 0,
						0,
						1,
					),
				);
			}),
		),
	);
};

/**
 * Load a raw pixel buffer with explicit dimensions. `copy = 1`: the engine
 * copies, so the caller's buffer may be released after the call. The buffer
 * must be `width * height * 4` bytes in the given color space (default
 * `ABGR8888S` = straight `[R,G,B,A]` bytes, matching what the SW canvas
 * renders out).
 */
export const loadRaw = (
	picture: OwnedPaint,
	rgba: Uint8Array,
	options: {
		readonly width: number;
		readonly height: number;
		readonly colorSpace?: ColorSpace;
	},
): Effect.Effect<void, ThorvgException, ThorvgWasm> =>
	withScratch(rgba.length)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) => {
				s.writeBytes(rgba);
				return checked("_tvg_picture_load_raw", () =>
					module._tvg_picture_load_raw(
						picture.ptr,
						s.ptr,
						options.width,
						options.height,
						options.colorSpace ?? ColorSpace.ABGR8888S,
						1,
					),
				);
			}),
		),
	);

/** Scale the picture to `width`×`height` (drawing size, not a crop). */
export const setSize = (picture: OwnedPaint, width: number, height: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_picture_set_size", () =>
				module._tvg_picture_set_size(picture.ptr, width, height),
			),
		),
	);

/** The picture's current (natural, unless set) size. */
export const getSize = (
	picture: OwnedPaint,
): Effect.Effect<
	{ width: number; height: number },
	ThorvgException,
	ThorvgWasm
> =>
	withScratch(8)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) =>
				checked("_tvg_picture_get_size", () =>
					module._tvg_picture_get_size(picture.ptr, s.ptr, s.ptr + 4),
				),
			),
			Effect.map(() => ({ width: s.readF32(0), height: s.readF32(4) })),
		),
	);

/** Set the picture's content origin. */
export const setOrigin = (picture: OwnedPaint, x: number, y: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_picture_set_origin", () =>
				module._tvg_picture_set_origin(picture.ptr, x, y),
			),
		),
	);
