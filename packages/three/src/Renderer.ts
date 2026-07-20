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
 * The GPU renderer actor: a branded handle over `THREE.WebGPURenderer`,
 * acquired with its async init awaited and disposed on scope close.
 *
 * Rendering, readback and compilation can fail or are async, so those are
 * Effects; sizing is infallible field bookkeeping, so it stays sync and
 * chains (see the wrapper conventions in AGENTS.md).
 */

export const TypeId = "~three/Renderer" as const;

export interface Renderer extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.renderer": THREE.WebGPURenderer;
}

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
 * three's `WebGPURenderer` constructor parameters, plus the initial sizing
 * applied before init (`setPixelRatio`/`setSize` — style untouched, callers
 * own the canvas CSS).
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

export const make = (
	options: MakeOptions = {},
): Effect.Effect<Renderer, ThreeException, Scope.Scope> =>
	Effect.acquireRelease(acquire(options), release);

/**
 * Render a scene through a camera. Sync-safe after `make` (init already
 * awaited); failures still surface as typed errors.
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
 * Read a render target back as tightly-packed, top-down RGBA rows.
 * WebGPU readback keeps a 256-byte row alignment — destrided here, so the
 * result is `width * height * 4` bytes ready for image encoding. Render
 * through a `RenderPipeline` first: it applies the sRGB output transform
 * (a raw render-target readback is linear).
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
 * Compile the pipelines a scene needs before its first presented frame —
 * the pre-warm that keeps first-frame pipeline compilation (~40–80ms) out
 * of playback.
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

/** Direct the renderer's output at a target, or `null` for the canvas. */
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

/** The current output target, or `null` when drawing to the canvas. */
export const getRenderTarget = (
	self: Renderer,
): RenderTarget.RenderTarget | null => {
	const target = self["~three.renderer"].getRenderTarget();
	return target === null ? null : RenderTargetModule.fromRaw(target);
};

/**
 * Whether the renderer clears before each render. Turning it off is how
 * an overlay pass (a HUD tier) draws above already-rendered content.
 */
export const setAutoClear: {
	(autoClear: boolean): (self: Renderer) => Renderer;
	(self: Renderer, autoClear: boolean): Renderer;
} = dual(firstArgIsRenderer, (self: Renderer, autoClear: boolean) => {
	self["~three.renderer"].autoClear = autoClear;
	return self;
});

/** Clear the depth buffer, so a following pass draws over what is there. */
export const clearDepth = (self: Renderer): Renderer => {
	self["~three.renderer"].clearDepth();
	return self;
};

/**
 * Advance three's node-graph frame counter.
 *
 * three only ticks this inside its rAF-driven animation loop, which a
 * headless export outruns — FRAME-deduped nodes (the scene pass above
 * all) then skip their per-frame work and consecutive frames sample a
 * stale texture. An export drives it explicitly: one exported frame IS
 * one three frame. `_nodes` is private, hence the cast.
 */
export const advanceFrame = (self: Renderer): Renderer => {
	(
		self["~three.renderer"] as unknown as {
			_nodes: { nodeFrame: { update(): void } };
		}
	)._nodes.nodeFrame.update();
	return self;
};

/** Logical size in CSS pixels; the drawing buffer is this × pixelRatio. */
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

export const setPixelRatio: {
	(pixelRatio: number): (self: Renderer) => Renderer;
	(self: Renderer, pixelRatio: number): Renderer;
} = dual(firstArgIsRenderer, (self: Renderer, pixelRatio: number) => {
	self["~three.renderer"].setPixelRatio(pixelRatio);
	return self;
});

export const getPixelRatio = (self: Renderer): number =>
	self["~three.renderer"].getPixelRatio();

/** Drawing-buffer size in device pixels (logical size × pixelRatio). */
export const getDrawingBufferSize = (
	self: Renderer,
): { readonly width: number; readonly height: number } => {
	const size = self["~three.renderer"].getDrawingBufferSize(
		new THREE.Vector2(),
	);
	return { width: size.x, height: size.y };
};
