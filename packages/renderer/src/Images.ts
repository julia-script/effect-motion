import { ThreeRaw as THREE } from "@effect-motion/three";
import { Deferred, Effect } from "effect";
import { EffectMotionError } from "effect-motion";

/**
 * The image-store actor: encoded bytes (from loader services) decode once
 * per renderer scope into three textures, released with that scope.
 *
 * This module is the decode boundary — browser decodes natively via
 * `createImageBitmap`, Node sniffs magic bytes and decodes PNG/JPEG with
 * pure-JS decoders (no canvas, no native deps); neither decoder is
 * touched from anywhere else.
 *
 * Each image is a `Deferred`: `register` forks the decode immediately (so
 * it overlaps the rest of the frame's sync) and completes the Deferred
 * with the texture or a typed failure; `ready` awaits it. A second
 * `register` for the same id is a no-op — the Deferred is already there,
 * and completing an already-completed Deferred is a no-op by contract, so
 * a racing decode cannot clobber the first result.
 */

export interface DecodedImage {
	readonly texture: THREE.Texture;
	readonly width: number;
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

/** The decode itself, as an Effect with a typed failure naming the image. */
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
 * Per-renderer decoded-image cache. Mostly data — the API is the sibling
 * functions.
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
 * Start decoding an image's bytes under its id (idempotent per id). The
 * decode is forked, so it runs while the rest of the frame syncs; `ready`
 * awaits the result.
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
 * The decoded texture for an id — `register` must have run first (a
 * missing registration is a defect; `Sync.resolveResources` guarantees
 * it). Decode failures arrive as a typed error naming the image.
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
 * Release every decoded texture. Only completed decodes hold one; an
 * in-flight or failed decode has nothing to free.
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
