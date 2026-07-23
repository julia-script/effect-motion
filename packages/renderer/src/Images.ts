import { ThreeRaw as THREE } from "@effect-motion/three";
import { Deferred, Effect } from "effect";
import { EffectMotionError } from "effect-motion";

/**
 * Decoded image textures, cached per renderer.
 *
 * @remarks
 * Encoded bytes arrive from loader services and are decoded once per
 * renderer scope into three textures, released when that scope closes. An
 * image used on a thousand frames is decoded once.
 *
 * This module is the decode boundary. In a browser, decoding goes through
 * the platform's own `createImageBitmap`; in Node it sniffs magic bytes and
 * decodes PNG or JPEG with pure-JS decoders — no canvas and no native
 * dependencies, which is what keeps headless export portable. On the Node
 * path, PNG and JPEG are the supported formats.
 *
 * Decodes are forked so they overlap the rest of the frame's sync rather
 * than blocking it, and `whenReady` on the sync actor is what waits for
 * them before a frame is drawn.
 */

/** A decoded image: its GPU texture and natural pixel dimensions. */
export interface DecodedImage {
	readonly texture: THREE.Texture;
	/** Natural width in pixels, before any scaling. */
	readonly width: number;
	/** Natural height in pixels, before any scaling. */
	readonly height: number;
}

const decodeNode = async (bytes: Uint8Array): Promise<DecodedImage> => {
	const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
	const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
	let rgba: Uint8Array;
	let width: number;
	let height: number;
	if (isPng) {
		const { PNG } = await import("pngjs");
		const png = PNG.sync.read(Buffer.from(bytes));
		rgba = new Uint8Array(png.data);
		width = png.width;
		height = png.height;
	} else if (isJpeg) {
		const jpeg = await import("jpeg-js");
		const decoded = jpeg.decode(bytes, { useTArray: true });
		rgba = decoded.data;
		width = decoded.width;
		height = decoded.height;
	} else {
		throw new Error(
			"unsupported image format on the Node path — PNG and JPEG are supported (headless decode is pure JS)",
		);
	}
	// decoded rows are top-down; DataTexture samples v=0 at data row 0
	// (bottom in three's UV convention) — flip rows so the image is upright
	const flipped = new Uint8Array(rgba.length);
	const stride = width * 4;
	for (let y = 0; y < height; y++) {
		flipped.set(
			rgba.subarray(y * stride, (y + 1) * stride),
			(height - 1 - y) * stride,
		);
	}
	const texture = new THREE.DataTexture(
		flipped,
		width,
		height,
		THREE.RGBAFormat,
		THREE.UnsignedByteType,
	);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.minFilter = THREE.LinearFilter;
	texture.magFilter = THREE.LinearFilter;
	texture.needsUpdate = true;
	return { texture, width, height };
};

const decodeBrowser = async (bytes: Uint8Array): Promise<DecodedImage> => {
	const bitmap = await createImageBitmap(
		new Blob([bytes as unknown as BlobPart]),
	);
	const texture = new THREE.Texture(bitmap);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;
	return { texture, width: bitmap.width, height: bitmap.height };
};

/**
 * Decode bytes to a texture, picking the platform's decoder. Internal —
 * failures are typed and name the image.
 */
const decode = (
	id: string,
	bytes: Uint8Array,
): Effect.Effect<DecodedImage, EffectMotionError> =>
	Effect.tryPromise({
		try: () =>
			typeof createImageBitmap === "undefined"
				? decodeNode(bytes)
				: decodeBrowser(bytes),
		catch: (cause) =>
			EffectMotionError.of(`Images: decoding image "${id}" failed`, cause),
	});

/**
 * The per-renderer image cache. Mostly data — the API is the sibling
 * functions ({@link register}, {@link ready}, {@link has},
 * {@link dispose}).
 */
export interface Images {
	/** internal: image id → its in-flight or completed decode */
	readonly entries: Map<
		string,
		Deferred.Deferred<DecodedImage, EffectMotionError>
	>;
}

export const make = (): Images => ({ entries: new Map() });

export const has = (images: Images, id: string): boolean =>
	images.entries.has(id);

/**
 * Begin decoding an image's bytes under an id.
 *
 * @remarks
 * Idempotent per id: registering the same image twice does nothing the
 * second time, and a racing decode cannot clobber the first result. The
 * decode is forked so it overlaps the rest of the frame's sync; use
 * {@link ready} to await the texture.
 */
export const register = Effect.fnUntraced(function* (
	images: Images,
	id: string,
	bytes: Uint8Array,
) {
	if (images.entries.has(id)) {
		return;
	}
	const deferred = yield* Deferred.make<DecodedImage, EffectMotionError>();
	images.entries.set(id, deferred);
	// fork: the decode overlaps sync work rather than blocking it. Its
	// result lands in the Deferred either way, so a failure surfaces
	// through `ready` instead of dying on an unobserved fiber.
	yield* Effect.forkScoped(
		Effect.matchEffect(decode(id, bytes), {
			onFailure: (error) => Deferred.fail(deferred, error),
			onSuccess: (image) => Deferred.succeed(deferred, image),
		}),
	);
});

/**
 * Await the decoded texture for an id.
 *
 * @remarks
 * {@link register} must have run first — asking for an unregistered image is
 * a defect, though in practice `Sync.resolveResources` guarantees
 * registration for anything a frame references. A failed decode arrives as a
 * typed error naming the image.
 */
export const ready = (
	images: Images,
	id: string,
): Effect.Effect<DecodedImage, EffectMotionError> => {
	const entry = images.entries.get(id);
	return entry === undefined
		? Effect.die(
				new Error(`Images: image "${id}" was not registered before use`),
			)
		: Deferred.await(entry);
};

/**
 * Release every decoded texture.
 *
 * @remarks
 * Called when the renderer's scope closes. Only completed decodes hold a
 * texture — an in-flight or failed one has nothing to free.
 */
export const dispose = Effect.fnUntraced(function* (images: Images) {
	for (const entry of images.entries.values()) {
		const done = yield* Deferred.isDone(entry);
		if (!done) {
			continue;
		}
		yield* Deferred.await(entry).pipe(
			Effect.map((image) => image.texture.dispose()),
			// a failed decode has no texture — nothing to release
			Effect.ignore,
		);
	}
	images.entries.clear();
});
