import { deflateSync } from "node:zlib";
import {
	Renderer as Gpu,
	PostProcessing,
	RenderTarget,
	type ThreeException,
	Scene as ThreeScene,
} from "@effect-motion/three";
// side effects first-class: installs navigator.gpu (Dawn), WebGPU globals,
// and the rAF/`self` shims three needs — before any renderer is created
import * as NodeGpu from "@effect-motion/three/node";
import { Effect, Scope } from "effect";
import type { EffectMotionError } from "effect-motion";
import type { Frame } from "effect-motion/Scene";
import { builtinRegistry } from "./Builtins.js";
import type { EntityRenderer } from "./EntityRenderer.js";
import type { RenderException } from "./RenderException.js";
import { renderCompTargets } from "./Renderer.js";
import * as Sync from "./Sync.js";

/**
 * Headless rendering for Node — the export path.
 *
 * @remarks
 * Renders frames on a real GPU without a browser (through Dawn, Chrome's
 * WebGPU implementation) and reads them back as PNG buffers. This is how a
 * scene becomes files on disk, or gets piped into a video encoder.
 *
 * Importing this module installs the WebGPU globals and browser shims three
 * expects, as a side effect, before any renderer exists. That is why it is a
 * separate subpath: none of it should reach a browser bundle.
 *
 * A renderer is fixed to one size for its lifetime, and rendering a
 * differently-sized frame is a defect rather than a silent rescale. Acquire
 * one per export, not one per frame — setup cost is paid once, and every
 * frame after reuses the same device, retained scene, and font atlas.
 *
 * @example
 * Export every frame of a scene to PNG files.
 * ```typescript
 * import * as NodeRenderer from "@effect-motion/renderer/node";
 * import * as Scene from "effect-motion/Scene";
 * import { Effect } from "effect";
 * import * as Stream from "effect/Stream";
 * import { writeFile } from "node:fs/promises";
 *
 * yield* Effect.scoped(
 * 	Effect.gen(function* () {
 * 		const renderer = yield* NodeRenderer.make({ width: 500, height: 300 });
 * 		let index = 0;
 * 		yield* Scene.stream(scene, { frameRate: 30 }).pipe(
 * 			Stream.runForEach((frame) =>
 * 				Effect.gen(function* () {
 * 					const png = yield* NodeRenderer.renderToPng(renderer, frame);
 * 					yield* Effect.promise(() =>
 * 						writeFile(`out/${String(index++).padStart(5, "0")}.png`, png),
 * 					);
 * 				}),
 * 			),
 * 		);
 * 	}),
 * );
 * ```
 */

type AnyFrame = Frame<unknown>;
// contravariant registry element type — see Sync.AnyEntityRenderer
type AnyEntityRenderer = EntityRenderer<never>;

// ── minimal RGBA → PNG encoder (filter 0 + zlib), lifted from the ThorVG
// package's node PNG path; node:zlib does the compression ────────────────

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
		c = (crcTable[(c ^ (bytes[i] ?? 0)) & 0xff] ?? 0) ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Uint8Array): Uint8Array => {
	const typeBytes = Uint8Array.from(type, (ch) => ch.charCodeAt(0));
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

/**
 * Encode a raw RGBA buffer as a PNG.
 *
 * @remarks
 * {@link renderToPng} already does this, so reach for it directly only when
 * you have pixels from somewhere else. The encoder is deliberately minimal —
 * no filtering, just zlib — which keeps it fast at the cost of somewhat
 * larger files than an optimizing encoder would produce.
 *
 * @param rgba - Exactly `width * height * 4` bytes, 8 bits per channel.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @returns The PNG file bytes.
 * @throws If `rgba` is not exactly `width * height * 4` bytes.
 */
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
	const idat = deflateSync(raw);
	const out = new Uint8Array(
		SIGNATURE.length + (12 + ihdr.length) + (12 + idat.length) + 12,
	);
	let offset = 0;
	for (const part of [
		SIGNATURE,
		chunk("IHDR", ihdr),
		chunk("IDAT", new Uint8Array(idat.buffer, idat.byteOffset, idat.length)),
		chunk("IEND", new Uint8Array(0)),
	]) {
		out.set(part, offset);
		offset += part.length;
	}
	return out;
};

// ── the node renderer ─────────────────────────────────────────────────────

export interface NodeRendererOptions {
	/** Logical width; frames rendered must match it. */
	readonly width: number;
	/** Logical height; frames rendered must match it. */
	readonly height: number;
	/**
	 * Supersampling factor — output is `width × height` scaled by this, so 2
	 * renders four times the pixels for cleaner edges.
	 *
	 * @defaultValue `1`
	 */
	readonly pixelRatio?: number;
	/**
	 * Renderers for custom entity kinds, or overrides for built-in ones.
	 * Merged over the built-in manifest by entity tag.
	 */
	readonly renderers?: Record<string, AnyEntityRenderer>;
}

/**
 * A live headless renderer.
 *
 * @remarks
 * Mostly data — the API is {@link renderToPng}. `pixelWidth` and
 * `pixelHeight` are the actual output dimensions, which differ from `width`
 * and `height` when supersampling.
 */
export interface NodeRenderer {
	readonly sync: Sync.Sync;
	readonly gpu: Gpu.Renderer;
	/** the acquisition scope — image decodes fork into it (see Renderer.ts) */
	readonly scope: Scope.Scope;
	/** internal: the plain render pipeline (world content only) */
	readonly post: PostProcessing.RenderPipeline;
	/** internal: pipeline with the HUD pass composited over the world */
	readonly postWithHud: PostProcessing.RenderPipeline;
	/** internal: the readback render target */
	readonly target: RenderTarget.RenderTarget;
	readonly width: number;
	readonly height: number;
	readonly pixelWidth: number;
	readonly pixelHeight: number;
	readonly pixelRatio: number;
}

/**
 * Render one frame and return it as PNG bytes.
 *
 * @remarks
 * The whole export path in one call: resolve the frame's fonts and images,
 * sync the retained scene, wait for glyph layouts and decodes, render, read
 * the pixels back off the GPU, and encode.
 *
 * Call it once per frame on the SAME renderer; state is retained between
 * calls, so consecutive frames only pay for what changed.
 *
 * The frame's dimensions must match the renderer's. A mismatch is a defect
 * naming both sizes, not a silent rescale.
 *
 * Output is `pixelWidth × pixelHeight` — larger than the logical size when
 * a `pixelRatio` was given.
 *
 * @param renderer - A renderer from {@link make}.
 * @param frame - The frame to draw.
 * @returns PNG file bytes.
 */
export const renderToPng = Effect.fnUntraced(function* (
	renderer: NodeRenderer,
	frame: AnyFrame,
): Effect.fn.Return<
	Uint8Array,
	ThreeException | EffectMotionError | RenderException
> {
	if (frame.width !== renderer.width || frame.height !== renderer.height) {
		// deliberate defect: a mis-sized frame is a caller bug, not a
		// recoverable condition
		return yield* Effect.die(
			new Error(
				`NodeRenderer: frame is ${frame.width}x${frame.height}, renderer was made for ${renderer.width}x${renderer.height}`,
			),
		);
	}
	yield* Sync.resolveResources(renderer.sync, frame).pipe(
		Effect.provideService(Scope.Scope, renderer.scope),
	);
	yield* Sync.syncFrame(renderer.sync, frame);
	// glyph layouts registered during sync must land before readback —
	// an export frame never ships half-built text
	yield* Sync.whenReady(renderer.sync);
	// three advances nodeFrame.frameId only inside its rAF-driven
	// animation loop (a 16ms setTimeout shim headless). Back-to-back
	// exports outrun it, so FRAME-deduped nodes — the scene PassNode
	// above all — skip their per-frame work and consecutive frames
	// read a stale pass texture (pairwise-duplicated video frames).
	// Drive it explicitly: one exported frame IS one three frame.
	// sync call in a generator: a plain statement, no Effect.sync ceremony
	// (that only buys an allocation and a fiber step for an infallible
	// field write). Effect.sync is for the combinators that take one —
	// ensuring, addFinalizer.
	Gpu.advanceFrame(renderer.gpu);
	yield* renderCompTargets(renderer.gpu, renderer.sync, renderer.pixelRatio);
	const pipeline = ThreeScene.isEmpty(renderer.sync.hudScene)
		? renderer.post
		: renderer.postWithHud;
	yield* PostProcessing.render(pipeline);
	const rgba = yield* Gpu.readRenderTarget(
		renderer.gpu,
		renderer.target,
		renderer.pixelWidth,
		renderer.pixelHeight,
	);
	return encodePng(rgba, renderer.pixelWidth, renderer.pixelHeight);
});

/**
 * Acquire a headless renderer.
 *
 * @remarks
 * Scoped: the GPU device, render targets, and every retained object are
 * released when the scope closes. Acquire one per export and reuse it for
 * every frame — startup involves creating a GPU device, so per-frame
 * acquisition is dramatically slower.
 *
 * `width` and `height` fix the renderer's size for its lifetime and must
 * match the frames you render.
 *
 * Use `pixelRatio` to supersample: a ratio of 2 renders at twice the linear
 * resolution (four times the pixels), which is the usual way to get cleaner
 * edges in an export.
 *
 * Depth of field is not applied — every frame renders sharp.
 *
 * @param options - Dimensions, supersampling, and any custom entity
 *   renderers.
 * @returns A renderer, valid for the current scope.
 */
export const make = Effect.fn("NodeRenderer.make")(function* (
	options: NodeRendererOptions,
): Effect.fn.Return<NodeRenderer, ThreeException, Scope.Scope> {
	const dpr = options.pixelRatio ?? 1;
	const pixelWidth = Math.round(options.width * dpr);
	const pixelHeight = Math.round(options.height * dpr);
	const registry: Record<string, AnyEntityRenderer> = {
		...builtinRegistry,
		...options.renderers,
	};
	const sync = Sync.make(registry);
	const device = yield* NodeGpu.makeDevice();
	const { canvas, context } = NodeGpu.stubCanvas(pixelWidth, pixelHeight);
	const gpu = yield* Gpu.make({
		canvas: canvas as unknown as HTMLCanvasElement,
		context: context as never,
		antialias: true,
		device,
		width: options.width,
		height: options.height,
		pixelRatio: dpr,
	});
	yield* Effect.addFinalizer(() => Sync.dispose(sync));
	const scenePass = PostProcessing.pass(sync.scene, sync.camera);
	// ponytail: no depth of field — the pipeline draws the scene pass
	// straight through.
	const sceneColor = scenePass.getTextureNode();
	const post = PostProcessing.makePipeline(gpu, sceneColor);
	// HUD composite variant: the HUD pass (identity camera, transparent
	// background) blended over the world INSIDE the pipeline, so the sRGB
	// output transform applies exactly once. Chosen per frame only when
	// HUD content exists — the plain pipeline never pays for the pass.
	// ponytail: TSL typing quarantined as in Text.ts.
	interface Node {
		readonly rgb: Node;
		readonly a: Node;
		mul(v: unknown): Node;
		add(v: unknown): Node;
		oneMinus(): Node;
	}
	const hudScenePass = PostProcessing.pass(sync.hudScene, sync.hudCamera);
	const hudTex = hudScenePass.getTextureNode() as Node;
	const postWithHud = PostProcessing.makePipeline(
		gpu,
		(sceneColor as Node).mul(hudTex.a.oneMinus()).add(hudTex.rgb.mul(hudTex.a)),
	);
	const target = yield* RenderTarget.make(pixelWidth, pixelHeight);
	Gpu.setRenderTarget(gpu, target);
	const scope = yield* Effect.scope;
	return {
		sync,
		gpu,
		scope,
		post,
		postWithHud,
		target,
		width: options.width,
		height: options.height,
		pixelWidth,
		pixelHeight,
		pixelRatio: dpr,
	};
});
