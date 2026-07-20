import type { ThreeException } from "@effect-motion/three";
import {
	Renderer as Gpu,
	PostProcessing,
	RenderTarget,
	Scene as ThreeScene,
} from "@effect-motion/three";
import type { Scope } from "effect";
import { Effect } from "effect";
import { dual } from "effect/Function";
import type { EffectMotionError } from "effect-motion";
import type * as Entity from "effect-motion/Entity";
import type { Frame } from "effect-motion/Scene";
import { builtinRegistry } from "./Builtins.js";
import { buildDofBlur, type DofUniforms, makeDofUniforms } from "./Dof.js";
import type { EntityRenderer } from "./EntityRenderer.js";
import type { RenderException } from "./RenderException.js";
import * as Sync from "./Sync.js";

/**
 * The browser frame-renderer actor: a `Sync` wired to a real WebGPU
 * renderer and the DoF post chain. Scoped — the GPU renderer and every
 * retained object dispose with the scope. Frames flow `resolveResources`
 * → `syncFrame` → `render`; DoF is bypassed structurally at aperture 0.
 */

type AnyFrame = Frame<unknown>;
type AnyEntityRenderer = EntityRenderer<Entity.AnyEntity>;

/**
 * Render every live sub-composition into its render target, depth-first
 * (nested comps first), leaving the renderer's previous target restored.
 * GPU-side companion to the sync actor's comp walk; both render paths
 * call it before their main pass.
 */
export const renderCompTargets = Effect.fnUntraced(function* (
	renderer: Gpu.Renderer,
	sync: Sync.Sync,
	pixelRatio: number,
): Effect.fn.Return<void, ThreeException> {
	for (const comp of sync.comps.values()) {
		yield* renderCompTargets(renderer, comp.sync, pixelRatio);
		const pw = Math.max(1, Math.round(comp.width * pixelRatio));
		const ph = Math.max(1, Math.round(comp.height * pixelRatio));
		if (
			comp.rt === null ||
			RenderTarget.width(comp.rt) !== pw ||
			RenderTarget.height(comp.rt) !== ph
		) {
			// comp targets live as long as their comp, not the frame — the
			// Sync owns them and disposes through disposeComp
			if (comp.rt !== null) {
				RenderTarget.dispose(comp.rt);
			}
			comp.rt = RenderTarget.makeUnsafe(pw, ph);
			comp.material.map = RenderTarget.texture(comp.rt);
			comp.material.needsUpdate = true;
		}
		const previous = Gpu.getRenderTarget(renderer);
		Gpu.setRenderTarget(renderer, comp.rt);
		// ensuring: the previous target comes back even when the render
		// fails — the sync version silently skipped the restore on a throw
		yield* Gpu.render(renderer, comp.sync.scene, comp.sync.camera).pipe(
			Effect.ensuring(
				Effect.sync(() => Gpu.setRenderTarget(renderer, previous)),
			),
		);
	}
});

export interface MakeOptions {
	readonly canvas?: HTMLCanvasElement;
	readonly width: number;
	readonly height: number;
	readonly pixelRatio?: number;
	/** custom entity renderers, merged over the built-in manifest */
	readonly renderers?: Record<string, AnyEntityRenderer>;
}

/**
 * `dual`'s predicate gets the whole `arguments` object — dispatch on
 * args[0]. Renderer is a plain interface (not branded), so this is a
 * structural check on the two fields every Renderer carries.
 */
const firstArgIsRenderer = (args: IArguments): boolean => {
	const first: unknown = args[0];
	return (
		typeof first === "object" &&
		first !== null &&
		"sync" in first &&
		"gpu" in first
	);
};

interface DofPipeline {
	readonly post: PostProcessing.RenderPipeline;
	readonly pass: PostProcessing.Pass;
	readonly key: string;
}

/**
 * A `Sync` wired to a real WebGPU renderer. Mostly data — the API is the
 * sibling functions (`syncFrame`, `resolveResources`, `render`,
 * `prewarm`).
 */
export interface Renderer {
	readonly sync: Sync.Sync;
	readonly gpu: Gpu.Renderer;
	/** internal: DoF uniforms shared across pipeline rebuilds */
	readonly uniforms: DofUniforms;
	/** internal: DoF pipeline, built lazily at the CURRENT drawing-buffer
	 * size and rebuilt on resize — constructing the pass while the
	 * renderer is still 1×1 (before the first frame sizes it) leaves the
	 * pass's depth texture stale after resize; viewZ then reads garbage
	 * and every pixel gets the same max CoC (uniform blur, nothing ever
	 * in focus). */
	dofPipeline: DofPipeline | null;
}

const ensureDofPipeline = (
	renderer: Renderer,
): PostProcessing.RenderPipeline => {
	const size = Gpu.getDrawingBufferSize(renderer.gpu);
	const key = `${size.width}x${size.height}`;
	if (renderer.dofPipeline === null || renderer.dofPipeline.key !== key) {
		if (renderer.dofPipeline !== null) {
			PostProcessing.disposePass(renderer.dofPipeline.pass);
		}
		const scenePass = PostProcessing.pass(
			renderer.sync.scene,
			renderer.sync.camera,
		);
		const post = PostProcessing.makePipeline(
			renderer.gpu,
			buildDofBlur(scenePass, renderer.uniforms),
		);
		renderer.dofPipeline = { post, pass: scenePass, key };
	}
	return renderer.dofPipeline.post;
};

/**
 * Resize the drawing buffer to a frame's logical size at a device pixel
 * ratio. Infallible field bookkeeping, so sync — mirrors the wrapper's
 * own rule.
 */
export const setViewport: {
	(
		width: number,
		height: number,
		pixelRatio: number,
	): (renderer: Renderer) => Renderer;
	(
		renderer: Renderer,
		width: number,
		height: number,
		pixelRatio: number,
	): Renderer;
} = dual(
	firstArgIsRenderer,
	(renderer: Renderer, width: number, height: number, pixelRatio: number) => {
		Gpu.setPixelRatio(renderer.gpu, pixelRatio);
		Gpu.setSize(renderer.gpu, width, height);
		return renderer;
	},
);

/**
 * Sync a frame into the retained scene. Scene-graph violations arrive as
 * a typed `RenderException` naming the offending instance.
 */
export const syncFrame = (
	renderer: Renderer,
	frame: AnyFrame,
): Effect.Effect<void, RenderException> => Sync.syncFrame(renderer.sync, frame);

/**
 * Resolve the frame's resources (font loaders, the auto-provided default
 * font, image loaders) into the renderer before syncing it — a missing
 * loader dies with a defect naming the id.
 */
export const resolveResources = (
	renderer: Renderer,
	frame: AnyFrame,
): Effect.Effect<void> => Sync.resolveResources(renderer.sync, frame);

/**
 * Render the current retained scene: through the DoF pipeline when the
 * frame's camera asks for it, the plain path otherwise (aperture 0 is
 * structurally off — the post chain is bypassed entirely). Waits for
 * async content (glyph layouts, image decodes) registered during sync,
 * so no frame presents half-built; a failed layout or decode arrives as
 * a typed error naming the resource.
 */
export const render = (
	renderer: Renderer,
): Effect.Effect<void, ThreeException | EffectMotionError> =>
	Sync.whenReady(renderer.sync).pipe(
		Effect.flatMap(() =>
			renderCompTargets(
				renderer.gpu,
				renderer.sync,
				Gpu.getPixelRatio(renderer.gpu),
			),
		),
		Effect.flatMap(() => {
			if (renderer.sync.dof.on) {
				renderer.uniforms.focus.value = renderer.sync.dof.focusDistance;
				renderer.uniforms.strength.value = renderer.sync.dof.strengthUv;
				return PostProcessing.render(ensureDofPipeline(renderer));
			}
			return Gpu.render(
				renderer.gpu,
				renderer.sync.scene,
				renderer.sync.camera,
			);
		}),
		Effect.flatMap(() => {
			// HUD overlay: identity camera, above everything, DoF-exempt
			if (ThreeScene.isEmpty(renderer.sync.hudScene)) {
				return Effect.void;
			}
			return Effect.sync(() => {
				Gpu.setAutoClear(renderer.gpu, false);
				Gpu.clearDepth(renderer.gpu);
			}).pipe(
				Effect.flatMap(() =>
					Gpu.render(
						renderer.gpu,
						renderer.sync.hudScene,
						renderer.sync.hudCamera,
					),
				),
				// autoClear must come back on even when the hud render fails
				Effect.ensuring(
					Effect.sync(() => {
						Gpu.setAutoClear(renderer.gpu, true);
					}),
				),
			);
		}),
	);

/**
 * Compile the retained scene's pipelines ahead of presentation — call
 * after the first `syncFrame`, before revealing the canvas, to keep
 * first-frame pipeline compilation out of playback.
 */
export const prewarm = (
	renderer: Renderer,
): Effect.Effect<void, ThreeException> =>
	Gpu.compile(renderer.gpu, renderer.sync.scene, renderer.sync.camera);

/**
 * Scoped renderer acquisition: the wrapper's WebGPU renderer (init
 * awaited, disposed on scope close) wired to a fresh sync actor.
 * Retained objects are disposed with the scope.
 */
export const make = Effect.fn("Renderer.make")(function* (
	options: MakeOptions,
): Effect.fn.Return<Renderer, ThreeException, Scope.Scope> {
	const registry: Record<string, AnyEntityRenderer> = {
		...builtinRegistry,
		...options.renderers,
	};
	const sync = Sync.make(registry);
	const gpu = yield* Gpu.make({
		...(options.canvas !== undefined ? { canvas: options.canvas } : {}),
		antialias: true,
		width: options.width,
		height: options.height,
		...(options.pixelRatio !== undefined
			? { pixelRatio: options.pixelRatio }
			: {}),
	});
	yield* Effect.addFinalizer(() => Effect.sync(() => Sync.dispose(sync)));
	// the DoF pipeline is built lazily at the real drawing-buffer size
	// (see ensureDofPipeline)
	return { sync, gpu, uniforms: makeDofUniforms(), dofPipeline: null };
});
