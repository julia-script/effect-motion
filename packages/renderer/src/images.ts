import { THREE } from "@effect-motion/three";

/**
 * Image assets: encoded bytes (from loader services) decode once per
 * renderer scope into three textures, disposed with the scope. Browser
 * decodes natively via `createImageBitmap`; Node sniffs magic bytes and
 * decodes PNG/JPEG with pure-JS decoders (no canvas, no native deps).
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
			"ImageStore: unsupported image format on the Node path — PNG and JPEG are supported (headless decode is pure JS)",
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

/** Per-renderer decoded-image cache: decode once, dispose with the scope. */
export class ImageStore {
	private readonly entries = new Map<string, Promise<DecodedImage>>();

	has(id: string): boolean {
		return this.entries.has(id);
	}

	/** Kick a decode for an image's bytes (idempotent per id). */
	register(id: string, bytes: Uint8Array): void {
		if (!this.entries.has(id)) {
			this.entries.set(
				id,
				typeof createImageBitmap === "undefined"
					? decodeNode(bytes)
					: decodeBrowser(bytes),
			);
		}
	}

	/** The decoded texture for an id — `register` must have run first. */
	ready(id: string): Promise<DecodedImage> {
		const entry = this.entries.get(id);
		if (entry === undefined) {
			return Promise.reject(
				new Error(`ImageStore: image "${id}" was not registered before use`),
			);
		}
		return entry;
	}

	dispose(): void {
		for (const entry of this.entries.values()) {
			void entry.then((decoded) => decoded.texture.dispose()).catch(() => {});
		}
		this.entries.clear();
	}
}
