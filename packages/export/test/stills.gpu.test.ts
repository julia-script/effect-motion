import { inflateSync } from "node:zlib";
import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entity as S, Scene } from "effect-motion";
import { expect, it } from "vitest";
import { Stills } from "../src";

// real Dawn GPU, like the renderer's headless-node tests; dimensions only
const scene = Scene.make(
	function* () {
		yield* Scene.instantiate("Circle", {
			position: S.vec3({}),
			radius: 20,
			fillColor: Color.rgba(255, 60, 60),
		});
		for (let i = 0; i < 3; i++) yield* Scene.tick;
	},
	{ width: 64, height: 32, backgroundColor: Color.rgba(10, 10, 20) },
);

const ihdr = (png: Uint8Array) => {
	const view = new DataView(png.buffer, png.byteOffset);
	return [view.getUint32(16, false), view.getUint32(20, false)];
};

it("renders a still and a 4-tile contact sheet", async () => {
	const frames = [
		...(await Effect.runPromise(Stream.runCollect(Scene.stream(scene)))),
	];
	expect(frames).toHaveLength(4);
	const [stills, sheet] = await Effect.runPromise(
		Effect.all([
			Stills.render(frames.slice(0, 1)),
			Stills.contactSheet(frames, { gap: 2 }),
		]),
	);
	expect(stills).toHaveLength(1);
	expect(ihdr(stills[0] ?? new Uint8Array())).toEqual([64, 32]);
	expect(sheet.columns).toBe(2);
	expect(ihdr(sheet.png)).toEqual([64 * 2 + 2, 32 * 2 + 2]);
}, 30_000);

// encodePng writes one IDAT with filter 0 on every row
const pixel = (png: Uint8Array, x: number, y: number) => {
	const [width = 0] = ihdr(png);
	const view = new DataView(png.buffer, png.byteOffset);
	const chunks: Array<Uint8Array> = [];
	for (let at = 8; at < png.length; ) {
		const length = view.getUint32(at, false);
		const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
		if (type === "IDAT") chunks.push(png.subarray(at + 8, at + 8 + length));
		at += 12 + length;
	}
	const raw = inflateSync(Buffer.concat(chunks));
	const start = y * (width * 4 + 1) + 1 + x * 4;
	return [...raw.subarray(start, start + 4)];
};

it("fills empty sheet cells opaque, even on a transparent background", async () => {
	const transparent = Scene.make(
		function* () {
			for (let i = 0; i < 2; i++) yield* Scene.tick;
		},
		{ width: 16, height: 8 },
	);
	const frames = [
		...(await Effect.runPromise(Stream.runCollect(Scene.stream(transparent)))),
	];
	const sheet = await Effect.runPromise(
		Stills.contactSheet(frames, { gap: 2 }),
	);
	expect([sheet.columns, sheet.rows]).toEqual([2, 2]);
	// the 4th cell has no frame; alpha 0 would show as white in viewers
	expect(pixel(sheet.png, 16 + 2 + 8, 8 + 2 + 4)[3]).toBe(255);
}, 30_000);
