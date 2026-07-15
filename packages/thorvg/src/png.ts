import { deflateSync } from "node:zlib";

// Minimal RGBA → PNG encoder. The Embind `render()` already hands back
// straight RGBA8888 (verified: opaque red lands at byte[0]), so no channel
// swizzle is needed — we filter each row (filter type 0), zlib-deflate the
// scanlines, and wrap them in the standard IHDR/IDAT/IEND chunks.
// ponytail: node:zlib does the compression; a real PNG lib (sharp/pngjs) only
// earns its keep if we need interlacing, palettes, or 16-bit — none here.

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const crcTable = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		t[n] = c >>> 0;
	}
	return t;
})();

const crc32 = (bytes: Uint8Array): number => {
	let c = 0xffffffff;
	for (let i = 0; i < bytes.length; i++) {
		c = crcTable[(c ^ bytes[i]!)! & 0xff]! ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Uint8Array => {
	const typeBytes = new Uint8Array([
		type.charCodeAt(0),
		type.charCodeAt(1),
		type.charCodeAt(2),
		type.charCodeAt(3),
	]);
	const body = new Uint8Array(typeBytes.length + data.length);
	body.set(typeBytes, 0);
	body.set(data, typeBytes.length);

	const out = new Uint8Array(4 + body.length + 4);
	const view = new DataView(out.buffer);
	view.setUint32(0, data.length, false);
	out.set(body, 4);
	view.setUint32(4 + body.length, crc32(body), false);
	return out;
};

/** Encode a raw RGBA8888 buffer (`width * height * 4` bytes) as a PNG. */
export const encodePng = (
	rgba: Uint8Array,
	width: number,
	height: number,
): Uint8Array => {
	if (rgba.length !== width * height * 4) {
		throw new Error(
			`encodePng: buffer is ${rgba.length} bytes, expected ${width * height * 4} (${width}x${height} RGBA)`,
		);
	}

	// prepend a filter byte (0 = none) to each scanline
	const stride = width * 4;
	const raw = new Uint8Array((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0;
		raw.set(
			rgba.subarray(y * stride, y * stride + stride),
			y * (stride + 1) + 1,
		);
	}

	const ihdr = new Uint8Array(13);
	const ihdrView = new DataView(ihdr.buffer);
	ihdrView.setUint32(0, width, false);
	ihdrView.setUint32(4, height, false);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // color type: RGBA
	// [10] compression, [11] filter, [12] interlace all 0

	const idat = new Uint8Array(deflateSync(raw));

	const chunks = [
		SIGNATURE,
		chunk("IHDR", ihdr),
		chunk("IDAT", idat),
		chunk("IEND", new Uint8Array(0)),
	];
	const total = chunks.reduce((n, c) => n + c.length, 0);
	const png = new Uint8Array(total);
	let offset = 0;
	for (const c of chunks) {
		png.set(c, offset);
		offset += c.length;
	}
	return png;
};
