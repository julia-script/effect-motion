import { type Effect, Predicate } from "effect";
import * as Pipeable from "effect/Pipeable";
import { pass as threePass, uniform } from "three/tsl";
import * as THREE from "three/webgpu";
import { wrap } from "./Interop.js";
import type * as Renderer from "./Renderer.js";
import type * as Scene from "./Scene.js";
import type { ThreeException } from "./ThreeException.js";

/**
 * Post-processing: rendering a scene through a shader graph rather than
 * straight to the output.
 *
 * @remarks
 * Two pieces. A {@link pass} renders a scene and exposes its result as
 * something a shader can sample; a {@link RenderPipeline} draws a node
 * graph built from those samples. Together they cover compositing two
 * scenes, applying a full-screen effect, or — the plainest use, and the
 * reason the export path has one at all — getting the sRGB output
 * transform applied, which a direct render-target readback does not do.
 *
 * Construction and graph assembly are synchronous and infallible;
 * {@link render} drives the GPU, so it is the one Effect here.
 *
 * TSL node types are deliberately `unknown` throughout this module. three's
 * published node types expand into unions large enough to send `tsc` into a
 * multi-minute type check, so they are quarantined and consumers re-declare
 * the minimal shape they actually use.
 */

export const TypeId = "~three/RenderPipeline" as const;

/** A handle to a post-processing pipeline. */
export interface RenderPipeline extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.renderPipeline": THREE.RenderPipeline;
}

/** Whether `u` is a {@link RenderPipeline} handle. */
export const isRenderPipeline = (u: unknown): u is RenderPipeline =>
	Predicate.hasProperty(u, TypeId);

/**
 * A rendered scene, exposed as nodes a shader graph can sample.
 *
 * @remarks
 * Accessors return TSL nodes typed as `unknown` — see the module overview
 * on why. Consumers re-declare the minimal node shape they use.
 */
export interface Pass {
	readonly "~three.pass": ReturnType<typeof threePass>;
	/** The pass's rendered color, as a node to sample. */
	readonly getTextureNode: (name?: string) => unknown;
	/**
	 * Per-pixel view-space depth, for effects that need to know how far away
	 * something is — fog, or a depth-driven blur.
	 */
	readonly getViewZNode: (name?: string) => unknown;
	/**
	 * The camera's near and far planes as auto-updating uniforms.
	 *
	 * @remarks
	 * Needed to linearize depth at an arbitrary sample point.
	 * {@link Pass.getViewZNode} only reports depth at the current pixel, so
	 * any effect gathering depth from NEIGHBOURING taps has to do the
	 * conversion itself. Reaches past three's public surface to get them.
	 */
	readonly cameraNear: unknown;
	readonly cameraFar: unknown;
}

/**
 * Render a scene through a camera into something a shader graph can sample.
 *
 * @remarks
 * The pass is the input end of a post chain: build one, take
 * {@link Pass.getTextureNode} as a node, combine it however you like, and
 * hand the result to {@link makePipeline}.
 */
export const pass = (scene: Scene.Scene, camera: THREE.Camera): Pass => {
	const raw = threePass(scene["~three.scene"], camera);
	const internals = raw as unknown as {
		_cameraNear: unknown;
		_cameraFar: unknown;
	};
	return {
		"~three.pass": raw,
		cameraNear: internals._cameraNear,
		cameraFar: internals._cameraFar,
		getTextureNode: (name) =>
			name === undefined ? raw.getTextureNode() : raw.getTextureNode(name),
		getViewZNode: (name) =>
			name === undefined ? raw.getViewZNode() : raw.getViewZNode(name),
	};
};

/**
 * Release a pass's GPU resources.
 *
 * @remarks
 * Passes are not scoped, so dispose one explicitly when its owner goes
 * away.
 */
export const disposePass = (self: Pass): void => {
	(self["~three.pass"] as unknown as { dispose?: () => void }).dispose?.();
};

/**
 * Build a pipeline that draws a shader graph to the renderer's output.
 *
 * @remarks
 * `outputNode` is the assembled TSL graph — a pass's texture straight
 * through for a plain sRGB transform, or something composited from several
 * sources. Its type is `unknown` on purpose; see the module overview.
 *
 * @param renderer - The renderer to draw with.
 * @param outputNode - The TSL node graph producing the final color.
 *
 * @example
 * A scene drawn through a pipeline, so the sRGB output transform applies.
 * ```typescript
 * const scenePass = PostProcessing.pass(scene, camera);
 * const pipeline = PostProcessing.makePipeline(
 * 	renderer,
 * 	scenePass.getTextureNode(),
 * );
 * yield* PostProcessing.render(pipeline);
 * ```
 */
export const makePipeline = (
	renderer: Renderer.Renderer,
	outputNode: unknown,
): RenderPipeline => {
	const pipeline = new THREE.RenderPipeline(renderer["~three.renderer"]);
	// the node graph's type is quarantined; the pipeline accepts it
	pipeline.outputNode = outputNode as never;
	const self: RenderPipeline = {
		[TypeId]: TypeId,
		"~three.renderPipeline": pipeline,
		// see Scene.ts on the array-like cast
		pipe(...fns: ReadonlyArray<(value: unknown) => unknown>) {
			return Pipeable.pipeArguments(self, fns as unknown as IArguments);
		},
	};
	return self;
};

/**
 * Draw the pipeline to the renderer's current output.
 *
 * @remarks
 * Use this INSTEAD of `Renderer.render` when a pipeline is involved — it
 * renders the passes the graph depends on and applies the output transform.
 */
export const render = (
	self: RenderPipeline,
): Effect.Effect<void, ThreeException> =>
	wrap("RenderPipeline.render", () => self["~three.renderPipeline"].render());

export { uniform };
