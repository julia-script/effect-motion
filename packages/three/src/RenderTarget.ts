import type { Scope } from "effect";
import { Effect, Predicate } from "effect";
import { dual } from "effect/Function";
import * as Pipeable from "effect/Pipeable";
import * as THREE from "three/webgpu";

/**
 * An offscreen render destination: a branded handle over
 * `THREE.RenderTarget`, whose GPU allocation is released with the scope.
 *
 * Construction is infallible (allocation is deferred to first use), so
 * `make` is an Effect only because it registers teardown — that is the
 * whole reason this type is branded rather than aliased.
 */

export const TypeId = "~three/RenderTarget" as const;

export interface RenderTarget extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.renderTarget": THREE.RenderTarget;
}

export const isRenderTarget = (u: unknown): u is RenderTarget =>
	Predicate.hasProperty(u, TypeId);

/**
 * `dual`'s predicate receives the whole `arguments` object, not the first
 * argument — dispatch on `args[0]`. Guard-based, never arity (AGENTS.md).
 */
const firstArgIsRenderTarget = (args: IArguments) => isRenderTarget(args[0]);

const brand = (target: THREE.RenderTarget): RenderTarget => {
	const self: RenderTarget = {
		[TypeId]: TypeId,
		"~three.renderTarget": target,
		// see Scene.ts on the array-like cast
		pipe(...fns: ReadonlyArray<(value: unknown) => unknown>) {
			return Pipeable.pipeArguments(self, fns as unknown as IArguments);
		},
	};
	return self;
};

/** A scoped render target of `width × height` device pixels. */
export const make = Effect.fnUntraced(function* (
	width: number,
	height: number,
): Effect.fn.Return<RenderTarget, never, Scope.Scope> {
	const target = new THREE.RenderTarget(width, height);
	yield* Effect.addFinalizer(() => Effect.sync(() => target.dispose()));
	return brand(target);
});

/**
 * A target WITHOUT scope-registered teardown — for one whose lifetime a
 * longer-lived owner already tracks (the renderer's per-comp targets,
 * recreated on resize and disposed with their comp). Prefer `make`.
 */
export const makeUnsafe = (width: number, height: number): RenderTarget =>
	brand(new THREE.RenderTarget(width, height));

/** Brand an existing target (same caveat as `makeUnsafe`). */
export const fromRaw = (target: THREE.RenderTarget): RenderTarget =>
	brand(target);

/**
 * Release the target's GPU allocation. Only for targets created with
 * `makeUnsafe`/`fromRaw` — a scoped `make` disposes itself.
 */
export const dispose = (self: RenderTarget): void => {
	self["~three.renderTarget"].dispose();
};

/** The color attachment, for sampling the rendered result. */
export const texture = (self: RenderTarget): THREE.Texture =>
	self["~three.renderTarget"].texture;

export const width = (self: RenderTarget): number =>
	self["~three.renderTarget"].width;

export const height = (self: RenderTarget): number =>
	self["~three.renderTarget"].height;

/**
 * Resize in place. Three reallocates the underlying GPU textures, so the
 * handle stays valid and nothing needs re-registering with the scope.
 */
export const setSize: {
	(nextWidth: number, nextHeight: number): (self: RenderTarget) => RenderTarget;
	(self: RenderTarget, nextWidth: number, nextHeight: number): RenderTarget;
} = dual(
	firstArgIsRenderTarget,
	(self: RenderTarget, nextWidth: number, nextHeight: number) => {
		self["~three.renderTarget"].setSize(nextWidth, nextHeight);
		return self;
	},
);
