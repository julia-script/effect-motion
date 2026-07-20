import type { Scope } from "effect";
import { Effect } from "effect";
import * as THREE from "three/webgpu";
import { wrap, wrapPromise } from "./Interop.js";
import type { ThreeException } from "./ThreeException.js";

/**
 * Scoped lifecycle over `THREE.WebGPURenderer`: construction plus async
 * initialization on acquire, `dispose` on scope close. The acquired value is
 * the raw `WebGPURenderer` — per-frame use (render loops, scene mutation)
 * stays plain three.
 */

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

export const make = (
	options: MakeOptions = {},
): Effect.Effect<THREE.WebGPURenderer, ThreeException, Scope.Scope> =>
	Effect.acquireRelease(
		Effect.gen(function* () {
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
			return renderer;
		}),
		(renderer) =>
			wrapPromise("WebGPURenderer.dispose", async () => {
				// disposing destroys GPU textures immediately, but the backend's
				// in-flight async chains (deferred submits, per-render resolves)
				// can still submit afterwards — "Destroyed texture used in a
				// submit" validation spam. Let pending work land while resources
				// are alive, drain the queue, then dispose.
				await new Promise((resolve) => setTimeout(resolve, 50));
				const device = (renderer.backend as { device?: GPUDevice }).device;
				if (device !== undefined) {
					await device.queue.onSubmittedWorkDone();
				}
				renderer.dispose();
			}).pipe(Effect.ignore),
	);

/**
 * Render a scene through a camera. Sync-safe after `make` (init already
 * awaited); failures still surface as typed errors.
 */
export const render = (
	renderer: THREE.WebGPURenderer,
	scene: THREE.Scene,
	camera: THREE.Camera,
): Effect.Effect<void, ThreeException> =>
	wrap("WebGPURenderer.render", () => renderer.render(scene, camera));

/**
 * Read a render target back as tightly-packed, top-down RGBA rows.
 * WebGPU readback keeps a 256-byte row alignment — destrided here, so the
 * result is `width * height * 4` bytes ready for image encoding. Render
 * through a `RenderPipeline` first: it applies the sRGB output transform
 * (a raw render-target readback is linear).
 */
export const readRenderTarget = (
	renderer: THREE.WebGPURenderer,
	target: THREE.RenderTarget,
	width: number,
	height: number,
): Effect.Effect<Uint8Array, ThreeException> =>
	wrapPromise("readRenderTargetPixelsAsync", () =>
		renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height),
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
	renderer: THREE.WebGPURenderer,
	scene: THREE.Object3D,
	camera: THREE.Camera,
): Effect.Effect<void, ThreeException> =>
	wrapPromise("WebGPURenderer.compileAsync", () =>
		renderer.compileAsync(scene, camera).then(() => undefined),
	);
