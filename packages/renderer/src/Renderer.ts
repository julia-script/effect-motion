import type { ThreeException } from "@effect-motion/three";
import {
	Renderer as Gpu,
	PostProcessing,
	RenderTarget,
	ThreeRaw as THREE,
	Scene as ThreeScene,
} from "@effect-motion/three";
import { Effect, Scope } from "effect";
import { dual } from "effect/Function";
import type { EffectMotionError } from "effect-motion";
import type { Frame } from "effect-motion/Scene";
import { builtinRegistry } from "./Builtins.js";
import type { EntityRenderer } from "./EntityRenderer.js";
import type { RenderException } from "./RenderException.js";
import * as Sync from "./Sync.js";

/**
 * The browser renderer: draws frames to a canvas with WebGPU.
 *
 * @remarks
 * Acquire one with {@link make} inside a `Scope`, then drive it once per
 * frame in three steps:
 *
 * 1. {@link resolveResources} — make sure fonts and images the frame needs
 *    are loaded.
 * 2. {@link syncFrame} — bring the retained three scene in step with the
 *    frame.
 * 3. {@link render} — draw it.
 *
 * The split exists so resource loading and scene-graph work can be paid for
 * separately from drawing; a player can sync ahead of presenting.
 *
 * Everything is scoped: the GPU renderer and every retained object are
 * released when the scope closes.
 *
 * For headless rendering and PNG export, use
 * `@effect-motion/renderer/node` instead.
 */

type AnyFrame = Frame<unknown>;
// contravariant registry element type — see Sync.AnyEntityRenderer
type AnyEntityRenderer = EntityRenderer<never>;

/**
 * Draw every nested sub-composition into its own render target.
 *
 * @remarks
 * Internal, called by both render paths before their main pass. Depth-first,
 * so a comp nested inside another is drawn before its parent samples it, and
 * the previously bound target is always restored — including when a render
 * fails.
 *
 * Comps render sharp: the child camera's `aperture` is not applied, and the
 * comp's plane takes the parent's depth of field at its own depth.
 * ponytail: the DoF chain sizes its passes to the drawing buffer and ends in
 * the sRGB output transform, so it can't draw into a comp target; a per-comp
 * chain sized to the target, output transform off, if a precomp needs its
 * own focus.
 */
export const renderCompTargets = Effect.fnUntraced(function* (
	renderer: Gpu.Renderer,
	sync: Sync.Sync,
	pixelRatio: number,
): Effect.fn.Return<void, ThreeException> {
	for (const comp of sync.comps.values()) {
		yield* renderCompTargets(renderer, comp.sync, pixelRatio);
		yield* renderMaskTargets(renderer, comp.sync, pixelRatio);
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
			// float depth: the reversed-Z precision paint order relies on
			// (Sync's syncLayers) — a default target gets depth24plus
			const depthTexture = new THREE.DepthTexture(pw, ph);
			depthTexture.type = THREE.FloatType;
			comp.rt = RenderTarget.fromRaw(
				new THREE.RenderTarget(pw, ph, { depthTexture }),
			);
			comp.material.map = RenderTarget.texture(comp.rt);
			comp.material.needsUpdate = true;
		}
		const previous = Gpu.getRenderTarget(renderer);
		Gpu.setRenderTarget(renderer, comp.rt);
		// the comp's HUD tier composites over its world inside the target,
		// through the comp's identity camera — pinned while the child's own
		// camera moves, exactly as at the root
		const hud = ThreeScene.isEmpty(comp.sync.hudScene)
			? Effect.void
			: Effect.sync(() => {
					Gpu.setAutoClear(renderer, false);
					Gpu.clearDepth(renderer);
				}).pipe(
					Effect.flatMap(() =>
						Gpu.render(renderer, comp.sync.hudScene, comp.sync.hudCamera),
					),
					Effect.ensuring(Effect.sync(() => Gpu.setAutoClear(renderer, true))),
				);
		// ensuring: the previous target comes back even when the render
		// fails — the sync version silently skipped the restore on a throw
		yield* Gpu.render(renderer, comp.sync.scene, comp.sync.camera).pipe(
			Effect.andThen(hud),
			Effect.ensuring(
				Effect.sync(() => Gpu.setRenderTarget(renderer, previous)),
			),
		);
	}
});

/** Draw every source alpha field before its composition's ordinary pass. */
export const renderMaskTargets = Effect.fnUntraced(function* (
	renderer: Gpu.Renderer,
	sync: Sync.Sync,
	pixelRatio: number,
): Effect.fn.Return<void, ThreeException> {
	Sync.prepareMaskDrawables(sync);
	const plan = sync.maskPlan;
	if (plan === null) return;
	const domainId = sync.domainId || [...plan.nodes.values()][0]?.id;
	const targets = plan.order.filter(
		(attachment) => attachment.domainId === domainId,
	);
	const draw = Effect.fnUntraced(function* () {
		for (const attachment of targets) {
			const target = sync.maskTargets.get(attachment.targetId);
			if (target === undefined) continue;
			const width = Math.max(1, Math.round(sync.width * pixelRatio));
			const height = Math.max(1, Math.round(sync.height * pixelRatio));
			if (
				RenderTarget.width(target.rt) !== width ||
				RenderTarget.height(target.rt) !== height
			) {
				RenderTarget.setSize(target.rt, width, height);
			}
			const scene = attachment.tier === "hud" ? sync.hudScene : sync.scene;
			const camera = attachment.tier === "hud" ? sync.hudCamera : sync.camera;
			const previous = Gpu.getRenderTarget(renderer);
			const background = ThreeScene.getBackground(scene);
			Sync.setMaskPass(sync, attachment.sourceId);
			ThreeScene.setBackground(scene, null);
			Gpu.setRenderTarget(renderer, target.rt);
			yield* Gpu.render(renderer, scene, camera).pipe(
				Effect.ensuring(
					Effect.sync(() => {
						Gpu.setRenderTarget(renderer, previous);
						ThreeScene.setBackground(scene, background);
					}),
				),
			);
		}
	});
	yield* draw().pipe(
		Effect.ensuring(Effect.sync(() => Sync.setMaskPass(sync, null))),
	);
});

/**
 * Depth-of-field sample quality: `"full"` is the node's default tap count
 * (export quality); `"realtime"` halves it — about half the GPU cost, a
 * little more sample noise, same blur shape and edges.
 */
export type DofQuality = "realtime" | "full";

/**
 * The depth-aware DoF node over a sync's world scene.
 *
 * @remarks
 * Internal, shared by both render paths. Built once per renderer, the first
 * time a frame asks for DoF; {@link setDofUniforms} feeds it each frame.
 *
 * `maxBlurPx` is the node default (30 render px) here; the browser path
 * rescales it per frame with the pixel ratio (see {@link renderWorldWithDof}).
 * Node export keeps 30 render px.
 */
export const makeDofNode = (
	sync: Sync.Sync,
	quality: DofQuality = "full",
): PostProcessing.DepthAwareDofNode =>
	PostProcessing.depthAwareDof(PostProcessing.pass(sync.scene, sync.camera), {
		focusDistance: sync.dof.focusDistance,
		aperture: sync.dof.aperture,
		// ponytail: a fixed half tap count, about half the blur's GPU time.
		// Scale taps by pixel count or measured frame time if a bigger canvas
		// or slower GPU still drops frames.
		...(quality === "realtime" ? { taps: { near: 32, far: 24 } } : {}),
	});

/** Copy this frame's focus and lens radius into the DoF node's uniforms. */
export const setDofUniforms = (
	node: PostProcessing.DepthAwareDofNode,
	dof: Sync.DofState,
): void => {
	node.focusDistance.value = dof.focusDistance;
	node.aperture.value = dof.aperture;
};

/**
 * A compositor that blends a sync's HUD pass over a world color node.
 *
 * @remarks
 * Internal, shared by both render paths. The HUD pass (identity camera,
 * transparent background) is blended INSIDE the pipeline, so the sRGB output
 * transform applies exactly once. ponytail: TSL typing quarantined as in
 * Text.ts.
 */
export const makeHudOver = (sync: Sync.Sync): ((world: unknown) => unknown) => {
	interface Node {
		readonly rgb: Node;
		readonly a: Node;
		mul(v: unknown): Node;
		add(v: unknown): Node;
		oneMinus(): Node;
	}
	const hudTex = PostProcessing.pass(
		sync.hudScene,
		sync.hudCamera,
	).getTextureNode() as Node;
	return (world) =>
		(world as Node).mul(hudTex.a.oneMinus()).add(hudTex.rgb.mul(hudTex.a));
};

/**
 * Draw the world through the DoF pipeline, building it on first use.
 *
 * @remarks
 * The chain's render targets dedupe per three frame, so the frame counter is
 * advanced here — a player can render several frames within one rAF tick.
 *
 * HUD content is composited inside the pipeline: the pipeline writes the
 * canvas directly, so a second plain canvas render would present three's
 * internal framebuffer — which never saw the DoF output — over it.
 */
const renderWorldWithDof = (
	renderer: Renderer,
	hud: boolean,
): Effect.Effect<void, ThreeException> => {
	if (renderer.dofChain === null) {
		const node = makeDofNode(renderer.sync, renderer.dofQuality);
		renderer.dofChain = {
			node,
			pipeline: PostProcessing.makePipeline(renderer.gpu, node),
			pipelineWithHud: PostProcessing.makePipeline(
				renderer.gpu,
				makeHudOver(renderer.sync)(node),
			),
		};
	}
	setDofUniforms(renderer.dofChain.node, renderer.sync.dof);
	// the blur cap is in render px; the Player's pixel ratio follows the
	// displayed size, so scale the cap with it (30 logical px) to keep the
	// look stable, clamped to the node's 48 px dilation reach
	renderer.dofChain.node.maxBlurPx.value = Math.min(
		48,
		30 * Gpu.getPixelRatio(renderer.gpu),
	);
	Gpu.advanceFrame(renderer.gpu);
	return Sync.withSeeThroughDepth(
		renderer.sync,
		PostProcessing.render(
			hud ? renderer.dofChain.pipelineWithHud : renderer.dofChain.pipeline,
		),
	);
};

export interface MakeOptions {
	/** Canvas to draw into; one is created if omitted. */
	readonly canvas?: HTMLCanvasElement;
	/** Logical width in CSS pixels. */
	readonly width: number;
	/** Logical height in CSS pixels. */
	readonly height: number;
	/**
	 * Device pixels per logical pixel — pass `window.devicePixelRatio` for a
	 * sharp result on a high-DPI display.
	 *
	 * @defaultValue `1`
	 */
	readonly pixelRatio?: number;
	/**
	 * Renderers for custom entity kinds, or overrides for built-in ones.
	 * Merged over the built-in manifest by entity tag.
	 */
	readonly renderers?: Record<string, AnyEntityRenderer>;
	/**
	 * Depth-of-field sample quality. `"realtime"` halves the blur's gather
	 * taps, about half the blur's GPU time, for a little more sample noise;
	 * pass `"full"` for export-quality blur (what the Node renderer always
	 * uses) when frame rate does not matter, e.g. recording the canvas.
	 *
	 * @defaultValue `"realtime"`
	 */
	readonly dofQuality?: DofQuality;
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

/**
 * A live browser renderer.
 *
 * @remarks
 * Mostly data — the API is the sibling functions ({@link syncFrame},
 * {@link resolveResources}, {@link render}, {@link prewarm}). `sync.stats`
 * is useful for diagnostics: it reports how many objects are retained and
 * how long the last sync took.
 */
export interface Renderer {
	readonly sync: Sync.Sync;
	readonly gpu: Gpu.Renderer;
	/**
	 * The scope this renderer was acquired in. Image decodes fork into it,
	 * so they are interrupted with the renderer rather than outliving it —
	 * and callers of `resolveResources` do not have to carry a Scope of
	 * their own.
	 */
	readonly scope: Scope.Scope;
	/** Depth-of-field sample quality, from {@link MakeOptions.dofQuality}. */
	readonly dofQuality: DofQuality;
	/** internal: the DoF pipeline, built the first time a frame asks for it */
	dofChain: {
		readonly node: PostProcessing.DepthAwareDofNode;
		readonly pipeline: PostProcessing.RenderPipeline;
		/** the same chain with the HUD composited over the DoF output */
		readonly pipelineWithHud: PostProcessing.RenderPipeline;
	} | null;
}

/**
 * Resize the drawing buffer.
 *
 * @remarks
 * `width` and `height` are logical (CSS) pixels; `pixelRatio` scales to
 * device pixels, so pass `window.devicePixelRatio` for a sharp result on a
 * high-DPI display. Call on canvas resize.
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
 * Bring the retained three scene in step with a frame.
 *
 * @remarks
 * This is the diff: objects new to this frame are built, ones whose data or
 * world position changed are updated, and ones that left are disposed.
 * Unchanged objects are skipped entirely, which is what makes a mostly-still
 * scene cheap to hold on screen.
 *
 * Scene-graph problems — an instance referenced twice, an unknown id, a Hud
 * nested inside world content, an entity with no registered renderer —
 * arrive as a typed {@link RenderException} naming the offender rather than
 * as a thrown exception.
 */
export const syncFrame = (
	renderer: Renderer,
	frame: AnyFrame,
): Effect.Effect<void, RenderException> => Sync.syncFrame(renderer.sync, frame);

/**
 * Load the fonts and images a frame needs, before syncing it.
 *
 * @remarks
 * Resources are resolved from the CALLER's context, so the loaders a scene
 * declared must be provided around this call. Work is done once per resource
 * per renderer: already-loaded fonts and images are skipped.
 *
 * The built-in default font is auto-provided, so plain text needs no setup.
 * A font or image the frame references with no loader in context is a defect
 * naming the id and the `Font.layer` / `Image.layer` call that would fix it.
 */
export const resolveResources = (
	renderer: Renderer,
	frame: AnyFrame,
): Effect.Effect<void> =>
	Sync.resolveResources(renderer.sync, frame).pipe(
		Effect.provideService(Scope.Scope, renderer.scope),
	);

/**
 * Draw the current retained scene to the canvas.
 *
 * @remarks
 * Call after {@link syncFrame}. Before drawing, this waits for the async
 * work that sync registered — glyph layouts and image decodes — so a frame
 * never presents half-built text or a missing texture. A failed layout or
 * decode surfaces as a typed error naming the resource.
 *
 * Nested sub-compositions are drawn to their own render targets first, then
 * the world, then any HUD content composited on top through an identity
 * camera so it ignores camera movement.
 *
 * With a camera `aperture > 0` the world draws through the depth-aware
 * depth-of-field chain (built on first use); at aperture 0 it is never
 * touched. HUD content is drawn after it and stays sharp.
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
			).pipe(
				Effect.andThen(
					renderMaskTargets(
						renderer.gpu,
						renderer.sync,
						Gpu.getPixelRatio(renderer.gpu),
					),
				),
			),
		),
		Effect.flatMap(() => {
			const hud = !ThreeScene.isEmpty(renderer.sync.hudScene);
			if (renderer.sync.dof.on) {
				// HUD composited inside the DoF pipeline — see renderWorldWithDof
				return renderWorldWithDof(renderer, hud);
			}
			const world = Gpu.render(
				renderer.gpu,
				renderer.sync.scene,
				renderer.sync.camera,
			);
			if (!hud) {
				return world;
			}
			// HUD overlay: identity camera, above everything. Both passes go
			// through three's internal framebuffer, so the overlay loads the
			// world it sits on.
			return world.pipe(Effect.andThen(renderHudOverlay(renderer)));
		}),
	);

const renderHudOverlay = (
	renderer: Renderer,
): Effect.Effect<void, ThreeException> =>
	Effect.sync(() => {
		Gpu.setAutoClear(renderer.gpu, false);
		Gpu.clearDepth(renderer.gpu);
	}).pipe(
		Effect.flatMap(() =>
			Gpu.render(renderer.gpu, renderer.sync.hudScene, renderer.sync.hudCamera),
		),
		// autoClear must come back on even when the hud render fails
		Effect.ensuring(
			Effect.sync(() => {
				Gpu.setAutoClear(renderer.gpu, true);
			}),
		),
	);

/**
 * Compile shader pipelines ahead of showing anything.
 *
 * @remarks
 * Call once after the first {@link syncFrame} and before revealing the
 * canvas. WebGPU compiles a pipeline the first time it is used, which would
 * otherwise land as a visible hitch on frame one; doing it here moves that
 * cost into startup.
 */
export const prewarm = (
	renderer: Renderer,
): Effect.Effect<void, ThreeException> =>
	Gpu.compile(renderer.gpu, renderer.sync.scene, renderer.sync.camera);

/**
 * Acquire a renderer for a canvas.
 *
 * @remarks
 * Scoped: the GPU device and every retained object are disposed when the
 * scope closes, so a player that mounts and unmounts leaks nothing.
 *
 * Pass `renderers` to draw entity kinds the built-ins do not cover, or to
 * override how a built-in kind is drawn — the map is merged over the
 * built-in manifest by entity tag.
 *
 * @param options - Canvas, dimensions, pixel ratio, and any custom entity
 *   renderers.
 * @returns A renderer, valid for the current scope.
 *
 * @example
 * ```typescript
 * const renderer = yield* Renderer.make({ canvas, width: 500, height: 300 });
 * yield* Renderer.resolveResources(renderer, frame);
 * yield* Renderer.syncFrame(renderer, frame);
 * yield* Renderer.render(renderer);
 * ```
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
		// reversed-Z float depth: uniform relative precision at any
		// distance, which Sync's paint-order nudge relies on
		reversedDepthBuffer: true,
		width: options.width,
		height: options.height,
		...(options.pixelRatio !== undefined
			? { pixelRatio: options.pixelRatio }
			: {}),
	});
	yield* Effect.addFinalizer(() => Sync.dispose(sync));
	const scope = yield* Effect.scope;
	return {
		sync,
		gpu,
		scope,
		dofQuality: options.dofQuality ?? "realtime",
		dofChain: null,
	};
});
