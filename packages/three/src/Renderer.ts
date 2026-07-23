import type { Scope } from "effect";
import { Effect, Predicate } from "effect";
import { dual } from "effect/Function";
import * as Pipeable from "effect/Pipeable";
import * as THREE from "three/webgpu";
import { wrap, wrapPromise } from "./Interop.js";
import type * as RenderTarget from "./RenderTarget.js";
import * as RenderTargetModule from "./RenderTarget.js";
import type * as Scene from "./Scene.js";
import type { ThreeException } from "./ThreeException.js";

/**
 * The GPU renderer — a scoped handle over three's `WebGPURenderer`.
 *
 * @remarks
 * {@link make} hands back a renderer whose async initialization has already
 * completed, so nothing downstream has to await a device that might not be
 * ready. On scope close it drains the GPU queue before disposing, which is
 * what prevents the "destroyed texture used in a submit" errors that
 * disposing mid-flight would otherwise produce.
 *
 * Work that touches the GPU — {@link render}, {@link readRenderTarget},
 * {@link compile} — is an Effect, typed as `ThreeException`. Sizing and
 * output-target bookkeeping cannot fail, so those stay synchronous and
 * chain through `.pipe`.
 */

export const TypeId = "~three/Renderer" as const;

/**
 * A handle to an initialized GPU renderer.
 *
 * @remarks
 * The three renderer stays reachable through `~three.renderer` for anything
 * this wrapper does not cover — a deliberate escape hatch, not the front
 * door.
 */
export interface Renderer extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.renderer": THREE.WebGPURenderer;
}

/** Whether `u` is a {@link Renderer} handle. */
export const isRenderer = (u: unknown): u is Renderer =>
	Predicate.hasProperty(u, TypeId);

/**
 * `dual`'s predicate receives the whole `arguments` object, not the first
 * argument — dispatch on `args[0]`. Guard-based, never arity (AGENTS.md).
 */
const firstArgIsRenderer = (args: IArguments) => isRenderer(args[0]);

const brand = (renderer: THREE.WebGPURenderer): Renderer => {
	const self: Renderer = {
		[TypeId]: TypeId,
		"~three.renderer": renderer,
		// see Scene.ts on the array-like cast
		pipe(...fns: ReadonlyArray<(value: unknown) => unknown>) {
			return Pipeable.pipeArguments(self, fns as unknown as IArguments);
		},
	};
	return self;
};

type WebGPURendererParameters = NonNullable<
	ConstructorParameters<typeof THREE.WebGPURenderer>[0]
>;

/**
 * Everything three's `WebGPURenderer` accepts, plus initial sizing applied
 * before initialization.
 *
 * @remarks
 * Sizing here rather than after `make` avoids an initial render at the
 * wrong size. Canvas CSS is never touched — callers own the element's
 * styling.
 */
export interface MakeOptions extends WebGPURendererParameters {
	readonly width?: number;
	readonly height?: number;
	readonly pixelRatio?: number;
}

const acquire = Effect.fnUntraced(function* (options: MakeOptions) {
	const { width, height, pixelRatio, ...parameters } = options;
	const renderer = yield* wrap(
		"WebGPURenderer",
		() => new THREE.WebGPURenderer(parameters),
	);
	if (pixelRatio !== undefined) {
		renderer.setPixelRatio(pixelRatio);
	}
	if (width !== undefined && height !== undefined) {
		renderer.setSize(width, height, false);
	}
	yield* wrapPromise("WebGPURenderer.init", () => renderer.init());
	return brand(renderer);
});

// disposing destroys GPU textures immediately, but the backend's in-flight
// async chains (deferred submits, per-render resolves) can still submit
// afterwards — "Destroyed texture used in a submit" validation spam. Let
// pending work land while resources are alive, drain the queue, then
// dispose. A release failure is logged, never thrown — teardown must not
// mask the scope's real outcome.
const release = (self: Renderer) => {
	const renderer = self["~three.renderer"];
	return Effect.sleep("50 millis").pipe(
		Effect.andThen(
			wrapPromise("WebGPURenderer queue drain", async () => {
				const device = (renderer.backend as { device?: GPUDevice }).device;
				if (device !== undefined) {
					await device.queue.onSubmittedWorkDone();
				}
			}),
		),
		Effect.andThen(wrap("WebGPURenderer.dispose", () => renderer.dispose())),
		Effect.catchCause((cause) =>
			Effect.logWarning("WebGPURenderer dispose failed", cause),
		),
	);
};

/**
 * Acquire a renderer, initialization already awaited.
 *
 * @remarks
 * Scoped: on close the renderer waits for in-flight GPU work to land,
 * drains the queue, and disposes. A failure during that teardown is logged
 * rather than raised, so it never masks the scope's real outcome.
 *
 * Without a `canvas`, three creates one. For headless use, pass the canvas
 * and device from `@effect-motion/three/node`.
 *
 * @param options - Renderer parameters plus optional initial sizing.
 * @returns A renderer, valid for the current scope.
 *
 * @example
 * ```typescript
 * const renderer = yield* Renderer.make({ width: 640, height: 360 });
 * ```
 */
export const make = (
	options: MakeOptions = {},
): Effect.Effect<Renderer, ThreeException, Scope.Scope> =>
	Effect.acquireRelease(acquire(options), release);

/**
 * Draw a scene through a camera.
 *
 * @remarks
 * Output goes wherever {@link setRenderTarget} last pointed — the canvas by
 * default, or an offscreen target. Safe to call immediately after
 * {@link make}, since initialization is already complete by then.
 */
export const render = (
	self: Renderer,
	scene: Scene.Scene,
	camera: THREE.Camera,
): Effect.Effect<void, ThreeException> =>
	wrap("WebGPURenderer.render", () =>
		self["~three.renderer"].render(scene["~three.scene"], camera),
	);

/**
 * Read rendered pixels back off the GPU as RGBA bytes.
 *
 * @remarks
 * The result is exactly `width * height * 4` bytes, top-down and tightly
 * packed — ready to hand to an image encoder. WebGPU itself pads each row
 * to a 256-byte boundary; that padding is stripped here so callers never
 * deal with stride.
 *
 * Colors come back LINEAR. Render through a
 * {@link PostProcessing.RenderPipeline} first if you want the sRGB output
 * transform applied — reading a raw render target and encoding it directly
 * produces a visibly dark image.
 *
 * @param target - The target to read.
 * @param width - Region width in device pixels.
 * @param height - Region height in device pixels.
 * @returns `width * height * 4` bytes of RGBA.
 */
export const readRenderTarget = (
	self: Renderer,
	target: RenderTarget.RenderTarget,
	width: number,
	height: number,
): Effect.Effect<Uint8Array, ThreeException> =>
	wrapPromise("readRenderTargetPixelsAsync", () =>
		self["~three.renderer"].readRenderTargetPixelsAsync(
			target["~three.renderTarget"],
			0,
			0,
			width,
			height,
		),
	).pipe(
		Effect.map((pixels) => {
			const padded = new Uint8Array(
				pixels.buffer as ArrayBuffer,
				pixels.byteOffset,
				pixels.byteLength,
			);
			const tightRow = width * 4;
			const paddedRow = Math.ceil(tightRow / 256) * 256;
			if (padded.length === tightRow * height) {
				return padded;
			}
			const rgba = new Uint8Array(tightRow * height);
			for (let y = 0; y < height; y++) {
				rgba.set(
					padded.subarray(y * paddedRow, y * paddedRow + tightRow),
					y * tightRow,
				);
			}
			return rgba;
		}),
	);

/**
 * Compile the shader pipelines a scene needs, ahead of drawing it.
 *
 * @remarks
 * WebGPU compiles a pipeline the first time it is used, which lands as a
 * visible hitch (roughly 40–80ms) on the first frame. Calling this after
 * the scene is populated but before anything is shown moves that cost into
 * startup.
 */
export const compile = (
	self: Renderer,
	scene: Scene.Scene,
	camera: THREE.Camera,
): Effect.Effect<void, ThreeException> =>
	wrapPromise("WebGPURenderer.compileAsync", () =>
		self["~three.renderer"]
			.compileAsync(scene["~three.scene"], camera)
			.then(() => undefined),
	);

/**
 * Point the renderer's output at an offscreen target, or `null` to draw to
 * the canvas.
 *
 * @remarks
 * Rendering to a target is how a result becomes something to sample —
 * reading pixels back, or feeding a texture into another pass. Save and
 * restore the previous target around nested renders; {@link getRenderTarget}
 * is there for exactly that.
 */
export const setRenderTarget: {
	(target: RenderTarget.RenderTarget | null): (self: Renderer) => Renderer;
	(self: Renderer, target: RenderTarget.RenderTarget | null): Renderer;
} = dual(
	firstArgIsRenderer,
	(self: Renderer, target: RenderTarget.RenderTarget | null) => {
		self["~three.renderer"].setRenderTarget(
			target === null ? null : target["~three.renderTarget"],
		);
		return self;
	},
);

/**
 * The current output target, or `null` when drawing to the canvas.
 *
 * @remarks
 * Read it before redirecting output so you can restore it afterwards.
 */
export const getRenderTarget = (
	self: Renderer,
): RenderTarget.RenderTarget | null => {
	const target = self["~three.renderer"].getRenderTarget();
	return target === null ? null : RenderTargetModule.fromRaw(target);
};

/**
 * Whether the renderer clears the canvas before each render.
 *
 * @remarks
 * Turning it off is how a second pass draws ON TOP of what is already
 * there — an overlay or HUD tier. Turn it back on afterwards, or the next
 * frame will accumulate over this one.
 */
export const setAutoClear: {
	(autoClear: boolean): (self: Renderer) => Renderer;
	(self: Renderer, autoClear: boolean): Renderer;
} = dual(firstArgIsRenderer, (self: Renderer, autoClear: boolean) => {
	self["~three.renderer"].autoClear = autoClear;
	return self;
});

/**
 * Clear the depth buffer.
 *
 * @remarks
 * Paired with `setAutoClear(false)` for an overlay pass: without it, the
 * overlay's geometry would be depth-tested against the world it is meant to
 * sit above and could be hidden by it.
 */
export const clearDepth = (self: Renderer): Renderer => {
	self["~three.renderer"].clearDepth();
	return self;
};

/**
 * Advance three's internal frame counter by one.
 *
 * @remarks
 * Only needed when driving renders yourself rather than through three's
 * animation loop — a headless export, above all.
 *
 * Nodes that dedupe their work per frame (the scene pass especially) decide
 * whether to recompute by comparing against this counter. three only ticks
 * it inside its own rAF loop, which an export outruns, so consecutive
 * exported frames would sample a stale texture and come out
 * pairwise-duplicated. Calling this once per exported frame makes one
 * exported frame mean one three frame.
 */
export const advanceFrame = (self: Renderer): Renderer => {
	(
		self["~three.renderer"] as unknown as {
			_nodes: { nodeFrame: { update(): void } };
		}
	)._nodes.nodeFrame.update();
	return self;
};

/**
 * Set the renderer's logical size in CSS pixels.
 *
 * @remarks
 * The actual drawing buffer is this multiplied by the pixel ratio. Canvas
 * CSS is left alone unless `updateStyle` is true, since callers usually own
 * the element's layout.
 *
 * @defaultValue `updateStyle` — `false`
 */
export const setSize: {
	(
		width: number,
		height: number,
		updateStyle?: boolean,
	): (self: Renderer) => Renderer;
	(
		self: Renderer,
		width: number,
		height: number,
		updateStyle?: boolean,
	): Renderer;
} = dual(
	firstArgIsRenderer,
	(self: Renderer, width: number, height: number, updateStyle = false) => {
		self["~three.renderer"].setSize(width, height, updateStyle);
		return self;
	},
);

/**
 * Set device pixels per logical pixel.
 *
 * @remarks
 * Pass `window.devicePixelRatio` for a sharp result on a high-DPI display,
 * or a fixed value above 1 to supersample an export for cleaner edges.
 */
export const setPixelRatio: {
	(pixelRatio: number): (self: Renderer) => Renderer;
	(self: Renderer, pixelRatio: number): Renderer;
} = dual(firstArgIsRenderer, (self: Renderer, pixelRatio: number) => {
	self["~three.renderer"].setPixelRatio(pixelRatio);
	return self;
});

/** The current device-pixels-per-logical-pixel ratio. */
export const getPixelRatio = (self: Renderer): number =>
	self["~three.renderer"].getPixelRatio();

/**
 * The drawing buffer's size in device pixels — the logical size multiplied
 * by the pixel ratio, and therefore the dimensions to read pixels back at.
 */
export const getDrawingBufferSize = (
	self: Renderer,
): { readonly width: number; readonly height: number } => {
	const size = self["~three.renderer"].getDrawingBufferSize(
		new THREE.Vector2(),
	);
	return { width: size.x, height: size.y };
};
