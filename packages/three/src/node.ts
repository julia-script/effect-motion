import type { Effect } from "effect";
import { create, globals } from "webgpu";
import { wrapPromise } from "./Interop.js";
import type { ThreeException } from "./ThreeException.js";

/**
 * The Node runtime: a real GPU without a browser. Dawn (the `webgpu` npm
 * bindings) provides WebGPU; this module installs the environment three
 * expects and acquires a core-feature device. Node-only — never import from
 * the browser-safe `.` entry.
 *
 * Import this module BEFORE creating a renderer: its top-level side effects
 * install `navigator.gpu`, the WebGPU constants, and the rAF/`self` shims
 * three's internals touch.
 *
 * Note: three's internal animation loop keeps rescheduling the rAF shim, so
 * the Node event loop never drains on its own — a standalone render script
 * must end with `process.exit(0)` (or run under `NodeRuntime.runMain`,
 * which exits explicitly). The export pipeline and test runners handle
 * this; plain `node script.mjs` will otherwise hang after finishing.
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
 * Request a core-feature Dawn device. three's own adapter request asks for
 * `featureLevel: 'compatibility'` (Dawn honors it, losing MSAA etc.;
 * Chrome upgrades it) — so acquire a core device ourselves and hand it to
 * the renderer constructor.
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
 * A stub canvas + context pair for a renderer that only ever draws into
 * render targets: the default framebuffer is never touched, and using it
 * is a loud error.
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
