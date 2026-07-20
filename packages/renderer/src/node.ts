import { deflateSync } from "node:zlib";
import {
	Renderer as Gpu,
	Interop,
	PostProcessing,
	THREE,
	type ThreeException,
} from "@effect-motion/three";
// side effects first-class: installs navigator.gpu (Dawn), WebGPU globals,
// and the rAF/`self` shims three needs — before any renderer is created
import * as NodeGpu from "@effect-motion/three/node";
import type { Scope } from "effect";
import { Effect } from "effect";
import type * as Entity from "effect-motion/Entity";
import type { Frame } from "effect-motion/Scene";
import { buildDofBlur, makeDofUniforms } from "./dof.js";
import type { EntityRenderer } from "./EntityRenderer.js";
import { FrameSync, renderCompTargets, resolveResources } from "./Renderer.js";
import { builtinRegistry } from "./shapes.js";

/**
 * The Node adapter: render frames on a real GPU (Dawn) without a browser
 * and read them back as PNG buffers — the export path. One renderer per
 * scope, fixed to the scene's dimensions; frames render through a
 * `RenderPipeline` (sRGB output transform) into a render target.
 */

type AnyFrame = Frame<unknown>;
type AnyEntityRenderer = EntityRenderer<Entity.AnyEntity>;

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
	readonly width: number;
	readonly height: number;
	/** supersampling factor: pixels are `width×height` × pixelRatio */
	readonly pixelRatio?: number;
	/** custom entity renderers, merged over the built-in manifest */
	readonly renderers?: Record<string, AnyEntityRenderer>;
}

export class NodeFrameRenderer {
	constructor(
		readonly sync: FrameSync,
		readonly renderer: THREE.WebGPURenderer,
		private readonly post: THREE.RenderPipeline,
		private readonly postWithHud: THREE.RenderPipeline,
		private readonly dofUniforms: {
			readonly focus: { value: number };
			readonly strength: { value: number };
		},
		private readonly target: THREE.RenderTarget,
		private readonly width: number,
		private readonly height: number,
		private readonly pixelWidth: number,
		private readonly pixelHeight: number,
		private readonly pixelRatioValue: number,
	) {}

	/** Sync a frame into the retained scene, render, read back, PNG-encode. */
	renderToPng(frame: AnyFrame): Effect.Effect<Uint8Array, ThreeException> {
		const self = this;
		return Effect.gen(function* () {
			if (frame.width !== self.width || frame.height !== self.height) {
				// deliberate defect: a mis-sized frame is a caller bug, not a
				// recoverable condition
				return yield* Effect.die(
					new Error(
						`NodeFrameRenderer: frame is ${frame.width}x${frame.height}, renderer was made for ${self.width}x${self.height}`,
					),
				);
			}
			yield* resolveResources(self.sync, frame);
			yield* Effect.sync(() => self.sync.syncFrame(frame));
			// glyph layouts registered during sync must land before readback —
			// an export frame never ships half-built text
			yield* Effect.promise(() => self.sync.whenReady());
			// custom gather-blur DoF (see make): aperture 0 zeroes the CoC,
			// so the blur is an arithmetic identity on sharp frames
			if (self.sync.dof.on) {
				self.dofUniforms.focus.value = self.sync.dof.focusDistance;
				self.dofUniforms.strength.value = self.sync.dof.strengthUv;
			} else {
				self.dofUniforms.strength.value = 0;
			}
			// three advances nodeFrame.frameId only inside its rAF-driven
			// animation loop (a 16ms setTimeout shim headless). Back-to-back
			// exports outrun it, so FRAME-deduped nodes — the scene PassNode
			// above all — skip their per-frame work and consecutive frames
			// read a stale pass texture (pairwise-duplicated video frames).
			// Drive it explicitly: one exported frame IS one three frame.
			yield* Effect.sync(() =>
				(
					self.renderer as unknown as {
						_nodes: { nodeFrame: { update(): void } };
					}
				)._nodes.nodeFrame.update(),
			);
			yield* renderCompTargets(self.renderer, self.sync, self.pixelRatioValue);
			const pipeline =
				self.sync.hudScene.children.length > 0 ? self.postWithHud : self.post;
			yield* Interop.wrap("RenderPipeline.render", () => pipeline.render());
			const rgba = yield* Gpu.readRenderTarget(
				self.renderer,
				self.target,
				self.pixelWidth,
				self.pixelHeight,
			);
			return encodePng(rgba, self.pixelWidth, self.pixelHeight);
		});
	}
}

/**
 * Scoped Node renderer acquisition: Dawn device, headless WebGPU renderer
 * over a stub canvas, retained sync core, and the render-target pipeline.
 *
 * DoF here is a custom gather blur (see the pipeline construction below) —
 * three's own TSL DoF node is broken under Dawn.
 */
export const make = Effect.fn("NodeRenderer.make")(function* (
	options: NodeRendererOptions,
): Effect.fn.Return<NodeFrameRenderer, ThreeException, Scope.Scope> {
	const dpr = options.pixelRatio ?? 1;
	const pixelWidth = Math.round(options.width * dpr);
	const pixelHeight = Math.round(options.height * dpr);
	const registry: Record<string, AnyEntityRenderer> = {
		...builtinRegistry,
		...options.renderers,
	};
	const sync = new FrameSync(registry);
	const device = yield* NodeGpu.makeDevice();
	const { canvas, context } = NodeGpu.stubCanvas(pixelWidth, pixelHeight);
	const renderer = yield* Gpu.make({
		canvas: canvas as unknown as HTMLCanvasElement,
		context: context as never,
		antialias: true,
		device,
		width: options.width,
		height: options.height,
		pixelRatio: dpr,
	});
	yield* Effect.addFinalizer(() => Effect.sync(() => sync.disposeRetained()));
	const scenePass = PostProcessing.pass(sync.scene, sync.camera);
	// custom depth-of-field shared with the browser path (see dof.ts)
	const dofUniforms = makeDofUniforms();
	const blurred = buildDofBlur(scenePass, dofUniforms) as never;
	const post = new PostProcessing.RenderPipeline(renderer);
	post.outputNode = blurred;
	// HUD composite variant: the HUD pass (identity camera, transparent
	// background) blended over the world INSIDE the pipeline, so the sRGB
	// output transform applies exactly once. Chosen per frame only when
	// HUD content exists — the plain pipeline never pays for the pass.
	// ponytail: TSL typing quarantined as in text.ts.
	interface Node {
		readonly rgb: Node;
		readonly a: Node;
		mul(v: unknown): Node;
		add(v: unknown): Node;
		oneMinus(): Node;
	}
	const hudScenePass = PostProcessing.pass(
		sync.hudScene,
		sync.hudCamera,
	) as unknown as { getTextureNode(): Node };
	const hudTex = hudScenePass.getTextureNode();
	const postWithHud = new PostProcessing.RenderPipeline(renderer);
	postWithHud.outputNode = (blurred as unknown as Node)
		.mul(hudTex.a.oneMinus())
		.add(hudTex.rgb.mul(hudTex.a)) as never;
	const target = new THREE.RenderTarget(pixelWidth, pixelHeight);
	yield* Effect.addFinalizer(() => Effect.sync(() => target.dispose()));
	renderer.setRenderTarget(target);
	return new NodeFrameRenderer(
		sync,
		renderer,
		post,
		postWithHud,
		dofUniforms,
		target,
		options.width,
		options.height,
		pixelWidth,
		pixelHeight,
		dpr,
	);
});
