import type { Effect } from "effect";
import { create, globals } from "webgpu";
import { wrapPromise } from "./Interop.js";
import type { ThreeException } from "./ThreeException.js";

/**
 * Running three.js on a real GPU in Node, with no browser.
 *
 * @remarks
 * WebGPU comes from Dawn (Chrome's implementation, via the `webgpu` npm
 * bindings). Importing this module installs the browser environment three
 * expects as a TOP-LEVEL SIDE EFFECT: `navigator.gpu`, the WebGPU
 * constants, `self`, a `requestAnimationFrame` shim, and a minimal
 * `XMLHttpRequest` that font loaders need. Import it before creating a
 * renderer.
 *
 * Node-only. Never import it from the browser-safe root entry.
 *
 * Two gotchas worth knowing before your first script:
 *
 * - **Your script will hang on exit.** three's animation loop keeps
 *   rescheduling the rAF shim, so Node's event loop never drains. End a
 *   standalone script with `process.exit(0)`, or run it under
 *   `NodeRuntime.runMain`, which exits explicitly. Test runners and the
 *   export pipeline already handle this.
 * - **There is no canvas**, so render into a `RenderTarget` and read it
 *   back. {@link stubCanvas} supplies the canvas-shaped object the renderer
 *   constructor insists on.
 *
 * @example
 * The headless setup, start to finish.
 * ```typescript
 * import * as NodeThree from "@effect-motion/three/node";
 * import { Renderer, RenderTarget, Scene } from "@effect-motion/three";
 * import { Effect } from "effect";
 *
 * const program = Effect.gen(function* () {
 * 	const device = yield* NodeThree.makeDevice();
 * 	const { canvas, context } = NodeThree.stubCanvas(640, 360);
 * 	const renderer = yield* Renderer.make({
 * 		canvas: canvas as unknown as HTMLCanvasElement,
 * 		context: context as never,
 * 		device,
 * 		width: 640,
 * 		height: 360,
 * 	});
 * 	const target = yield* RenderTarget.make(640, 360);
 * 	Renderer.setRenderTarget(renderer, target);
 * 	yield* Renderer.render(renderer, scene, camera);
 * 	return yield* Renderer.readRenderTarget(renderer, target, 640, 360);
 * }).pipe(Effect.scoped);
 * ```
 */

// WebGPU constants (GPUBufferUsage etc.) that browser code assumes global
Object.assign(globalThis, globals);

// Node ≥ 24 defines `navigator` as a getter-only global — defineProperty
// over it. Idempotent: skip when a gpu-bearing navigator already exists.
if (
	typeof navigator === "undefined" ||
	(navigator as { gpu?: unknown }).gpu === undefined
) {
	Object.defineProperty(globalThis, "navigator", {
		value: { gpu: create([]) },
		configurable: true,
	});
}

// three's internal Animation loop wants requestAnimationFrame on `self`
const g = globalThis as Record<string, unknown>;
if (g.self === undefined) {
	g.self = globalThis;
}
if (g.requestAnimationFrame === undefined) {
	g.requestAnimationFrame = (cb: (t: number) => void) =>
		setTimeout(() => cb(performance.now()), 16);
	g.cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) =>
		clearTimeout(id);
}

// Minimal XMLHttpRequest over fetch: arraybuffer GETs only — what font
// loaders (troika's Typr path) need. Supports data:/http(s) URIs.
if (g.XMLHttpRequest === undefined) {
	class NodeXHR {
		responseType = "";
		response: unknown = null;
		status = 0;
		statusText = "";
		onload: (() => void) | null = null;
		onerror: ((err: unknown) => void) | null = null;
		private url = "";
		open(_method: string, url: string): void {
			this.url = url;
		}
		send(): void {
			fetch(this.url)
				.then(async (res) => {
					this.status = res.status;
					this.statusText = res.statusText;
					this.response =
						this.responseType === "arraybuffer"
							? await res.arrayBuffer()
							: await res.text();
					this.onload?.();
				})
				.catch((err) => {
					this.onerror?.(err);
				});
		}
	}
	g.XMLHttpRequest = NodeXHR;
}

/**
 * Acquire a GPU device from Dawn.
 *
 * @remarks
 * Pass the result to `Renderer.make` rather than letting three request its
 * own. three asks for a "compatibility" feature level, which Chrome quietly
 * upgrades but Dawn honors literally — costing MSAA and other core features,
 * so headless output would be visibly worse than the browser's for the same
 * scene. This requests a core device with every feature the adapter offers.
 *
 * Fails with a `ThreeException` when no adapter is available.
 */
export const makeDevice = (): Effect.Effect<GPUDevice, ThreeException> =>
	wrapPromise("requestAdapter", async () => {
		const gpu = (navigator as { gpu: GPU }).gpu;
		const adapter = await gpu.requestAdapter({
			featureLevel: "core",
		} as GPURequestAdapterOptions);
		if (adapter === null) {
			throw new Error("no WebGPU adapter available (Dawn)");
		}
		return adapter.requestDevice({
			requiredFeatures: [...adapter.features] as Array<GPUFeatureName>,
		});
	});

/**
 * A canvas-shaped stand-in for headless rendering.
 *
 * @remarks
 * three's renderer requires a canvas and a context even when nothing is
 * displayed. These satisfy that without a DOM. The renderer must draw only
 * into render targets: asking this context for the default framebuffer
 * throws, deliberately, rather than silently rendering nowhere.
 *
 * @param width - Buffer width in device pixels.
 * @param height - Buffer height in device pixels.
 */
export const stubCanvas = (width: number, height: number) => {
	const context = {
		configure() {},
		unconfigure() {},
		getCurrentTexture(): never {
			throw new Error("default framebuffer used in headless mode");
		},
	};
	const canvas = {
		width,
		height,
		style: {},
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent() {},
		getContext: () => context,
	};
	return { canvas, context };
};
