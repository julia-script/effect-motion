import { ThreeRaw as THREE } from "@effect-motion/three";
import { Effect } from "effect";
import { EffectMotionError } from "effect-motion";

/**
 * The image-store actor: encoded bytes (from loader services) decode once
 * per renderer scope into three textures, disposed with the scope. This
 * module is the decode boundary — browser decodes natively via
 * `createImageBitmap`, Node sniffs magic bytes and decodes PNG/JPEG with
 * pure-JS decoders (no canvas, no native deps); neither decoder is
 * touched from anywhere else. Decodes start eagerly at `register` (so
 * they overlap the rest of the frame's sync) and surface typed through
 * `ready`.
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

/**
 * Per-renderer decoded-image cache. Mostly data — the API is the sibling
 * functions. The entries hold in-flight decode promises: decodes start at
 * `register` so they overlap sync work, which is exactly the eager
 * semantics a lazily-run Effect would lose.
 */
export interface Images {
	/** internal: image id → in-flight or settled decode */
	readonly entries: Map<string, Promise<DecodedImage>>;
}

export const make = (): Images => ({ entries: new Map() });

export const has = (images: Images, id: string): boolean =>
	images.entries.has(id);

/** Kick a decode for an image's bytes (idempotent per id). */
export const register = (
	images: Images,
	id: string,
	bytes: Uint8Array,
): void => {
	if (!images.entries.has(id)) {
		const decode =
			typeof createImageBitmap === "undefined"
				? decodeNode(bytes)
				: decodeBrowser(bytes);
		// surface failures through `ready`, never as an unhandled rejection
		decode.catch(() => {});
		images.entries.set(id, decode);
	}
};

/** The decoded texture for an id — `register` must have run first (a
 * missing registration is a defect; `Sync.resolveResources` guarantees
 * it). Decode failures land in the error channel naming the image. */
export const ready = (
	images: Images,
	id: string,
): Effect.Effect<DecodedImage, EffectMotionError> => {
	const entry = images.entries.get(id);
	if (entry === undefined) {
		return Effect.die(
			new Error(`Images: image "${id}" was not registered before use`),
		);
	}
	return Effect.tryPromise({
		try: () => entry,
		catch: (cause) =>
			EffectMotionError.of(`Images: decoding image "${id}" failed`, cause),
	});
};

export const dispose = (images: Images): void => {
	for (const entry of images.entries.values()) {
		// best-effort teardown: a failed decode has nothing to dispose
		void entry.then((decoded) => decoded.texture.dispose()).catch(() => {});
	}
	images.entries.clear();
};
