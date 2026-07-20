import { type Effect, Predicate } from "effect";
import * as Pipeable from "effect/Pipeable";
import { pass as threePass, uniform } from "three/tsl";
import * as THREE from "three/webgpu";
import { wrap } from "./Interop.js";
import type * as Renderer from "./Renderer.js";
import type * as Scene from "./Scene.js";
import type { ThreeException } from "./ThreeException.js";

/**
 * Post-processing: a branded `RenderPipeline` plus the scene pass that
 * feeds it.
 *
 * Pipeline construction and node-graph assembly are sync and infallible;
 * `render` drives the GPU and can fail, so it is the one Effect here.
 * `uniform` and the TSL node builders stay bare re-exports — node graphs
 * are pure description, deliberately type-quarantined (see Tsl.ts).
 */

export const TypeId = "~three/RenderPipeline" as const;

export interface RenderPipeline extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.renderPipeline": THREE.RenderPipeline;
}

export const isRenderPipeline = (u: unknown): u is RenderPipeline =>
	Predicate.hasProperty(u, TypeId);

/**
 * A scene pass — the node the post chain samples.
 *
 * Node accessors (`getTextureNode`, `getViewZNode`) return TSL nodes,
 * whose types are deliberately quarantined: @types/three's
 * ShaderNodeObject unions sent tsc into a 14-CPU-minute expansion, so
 * consumers re-declare the minimal shape they use. Hence `unknown` here
 * rather than three's node types.
 */
export interface Pass {
	readonly "~three.pass": ReturnType<typeof threePass>;
	/** the pass's color output, for sampling in a post chain */
	readonly getTextureNode: (name?: string) => unknown;
	/** per-pixel view-space depth, for depth-driven effects */
	readonly getViewZNode: (name?: string) => unknown;
	/**
	 * The pass's auto-updated camera near/far uniforms. Private upstream,
	 * but the only route to linearizing depth at an arbitrary uv — the
	 * public getViewZNode is fixed at screenUV, so a gather that samples
	 * depth at neighbouring taps needs these.
	 */
	readonly cameraNear: unknown;
	readonly cameraFar: unknown;
}

/** Build a pass over a scene and camera. */
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

/** Dispose a pass's GPU resources, if it holds any. */
export const disposePass = (self: Pass): void => {
	(self["~three.pass"] as unknown as { dispose?: () => void }).dispose?.();
};

/**
 * A pipeline over a renderer. `outputNode` is the TSL node graph the
 * pipeline draws — assembled by the caller (the DoF chain, a HUD
 * composite), so it stays `unknown` here rather than importing TSL's
 * type explosion.
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

/** Draw the pipeline — the GPU work, so the one Effect in this module. */
export const render = (
	self: RenderPipeline,
): Effect.Effect<void, ThreeException> =>
	wrap("RenderPipeline.render", () => self["~three.renderPipeline"].render());

export { uniform };
