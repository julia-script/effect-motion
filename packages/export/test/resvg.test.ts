import { Effect, Layer, Schema } from "effect";
import * as FileSystem from "effect/FileSystem";
import * as Stream from "effect/Stream";
import { Entity, Scene, Shapes, Svg } from "effect-motion";
import { expect, it } from "vitest";
import { Resvg } from "../src";

const richText = {
	type: "root",
	children: [
		{
			type: "paragraph",
			children: [
				{ type: "text", value: "plain " },
				{ type: "strong", children: [{ type: "text", value: "bold" }] },
			],
		},
	],
} satisfies Shapes.TextContent;

const allSurfaceScene = Scene.make(function* () {
	yield* Scene.instantiate(Shapes.Circle, { x: 40, y: 40, radius: 20, fill: "#fde68a" });
	yield* Scene.instantiate(Shapes.Rect, { x: 80, y: 10, width: 60, height: 40, fill: "#7c3aed" });
	yield* Scene.instantiate(Shapes.Square, { x: 150, y: 10, size: 30, fill: "#333" });
	yield* Scene.instantiate(Shapes.Ellipse, { x: 220, y: 40, rx: 25, ry: 12, fill: "#f9a8d4" });
	yield* Scene.instantiate(Shapes.Line, { x: 10, y: 90, x2: 290, y2: 90, stroke: "#94a3b8", strokeWidth: 2 });
	yield* Scene.instantiate(Shapes.Path, { x: 10, y: 110, d: "M 0 0 C 20 -20, 60 -20, 80 0", stroke: "#34d399", strokeWidth: 3, fill: "none" });
	const g = yield* Scene.instantiate(Shapes.Group, { x: 200, y: 120 });
	yield* Scene.instantiate(Shapes.Circle, { x: 0, y: 0, radius: 10, fill: "#fef3c7" }, { parent: g });
	yield* Scene.instantiate(Shapes.Text, { text: richText, x: 20, y: 160, fontSize: 14, fontFamily: "Helvetica, sans-serif", fill: "#f8fafc" });
	yield* Scene.tick;
});

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

const svgOf = <E, R, Entities>(
	scene: Scene.Scene<E, R, Entities>,
	extraLayer?: Layer.Layer<never>,
) =>
	Effect.runPromise(
		Effect.gen(function* () {
			const head = yield* Scene.stream(scene as never).pipe(Stream.runHead);
			if (head._tag !== "Some") throw new Error("no frames");
			const renderer = yield* Svg.SvgRenderer.Context;
			return yield* renderer.render(head.value as never, {});
		}).pipe(
			Effect.provide(extraLayer ? Layer.mergeAll(layers, extraLayer) : layers),
		) as Effect.Effect<string>,
	);

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// IHDR: width at byte 16, height at byte 20, big-endian
const dimension = (png: Uint8Array, offset: number) =>
	new DataView(png.buffer, png.byteOffset).getUint32(offset);

it("rasterizes string-sink output to a PNG with frame dimensions", async () => {
	const svg = await svgOf(allSurfaceScene);
	const png = await Effect.runPromise(Resvg.rasterize(svg));

	expect([...png.slice(0, 8)]).toEqual(pngSignature);
	// scene ran with default 500x300 frame metadata
	expect(dimension(png, 16)).toBe(500);
	expect(dimension(png, 20)).toBe(300);
});

it("custom entities rasterize without rasterizer-specific setup", async () => {
	const Blob = Entity.make("test/Blob", { x: Schema.Number });
	const blobLayer = Svg.entityRendererLayer(Blob, ({ data }) =>
		Effect.succeed({
			tag: "rect",
			props: { x: data.x, y: 0, width: 100, height: 100, fill: "#ff0044" },
		}),
	);
	const emptyScene = Scene.make(function* () {
		yield* Scene.tick;
	});
	const blobScene = Scene.make(function* () {
		yield* Scene.instantiate(Blob, { x: 10 });
		yield* Scene.tick;
	});

	const [empty, withBlob] = await Promise.all([
		svgOf(emptyScene),
		svgOf(blobScene, blobLayer),
	]);
	const [emptyPng, blobPng] = await Promise.all([
		Effect.runPromise(Resvg.rasterize(empty)),
		Effect.runPromise(Resvg.rasterize(withBlob)),
	]);

	expect(withBlob).toContain("#ff0044");
	expect(Buffer.from(blobPng).equals(Buffer.from(emptyPng))).toBe(false);
});

it("rasterizeToFile writes through the FileSystem service", async () => {
	const svg = await svgOf(allSurfaceScene);
	const written: Array<{ path: string; data: Uint8Array }> = [];
	const fsLayer = FileSystem.layerNoop({
		writeFile: (path, data) =>
			Effect.sync(() => {
				written.push({ path, data });
			}),
	});

	await Effect.runPromise(
		Resvg.rasterizeToFile(svg, "out/frame-0001.png").pipe(
			Effect.provide(fsLayer),
		),
	);

	expect(written).toHaveLength(1);
	expect(written[0]?.path).toBe("out/frame-0001.png");
	expect([...(written[0]?.data.slice(0, 8) ?? [])]).toEqual(pngSignature);
});

it("unparsable input fails with a typed RasterizeError", async () => {
	const failure = await Effect.runPromise(
		Effect.flip(Resvg.rasterize("definitely not svg")),
	);
	expect(failure._tag).toBe("RasterizeError");
	expect(failure).toBeInstanceOf(Resvg.RasterizeError);
});
