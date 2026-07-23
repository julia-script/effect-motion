import type { Scope } from "effect";
import { Effect, Predicate } from "effect";
import { dual } from "effect/Function";
import * as Pipeable from "effect/Pipeable";
import * as THREE from "three/webgpu";

/**
 * An offscreen render destination — draw into it instead of the canvas.
 *
 * @remarks
 * Rendering to a target is how a rendered result becomes something you can
 * use: read its pixels back for export, or sample its texture in another
 * pass.
 *
 * Construction cannot fail — the GPU allocation is deferred until first
 * use — so {@link make} is an Effect purely to register teardown. That is
 * also the only reason this is a branded handle rather than a plain alias:
 * a render target owns GPU memory that has to be released.
 */

export const TypeId = "~three/RenderTarget" as const;

/**
 * A handle to an offscreen render destination.
 *
 * @remarks
 * The underlying target stays reachable through `~three.renderTarget` for
 * anything this wrapper does not cover.
 */
export interface RenderTarget extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.renderTarget": THREE.RenderTarget;
}

/** Whether `u` is a {@link RenderTarget} handle. */
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

/**
 * A render target of `width × height` device pixels, freed when the scope
 * closes.
 *
 * @remarks
 * Dimensions are DEVICE pixels, so multiply by the pixel ratio yourself
 * when supersampling.
 */
export const make = Effect.fnUntraced(function* (
	width: number,
	height: number,
): Effect.fn.Return<RenderTarget, never, Scope.Scope> {
	const target = new THREE.RenderTarget(width, height);
	yield* Effect.addFinalizer(() => Effect.sync(() => target.dispose()));
	return brand(target);
});

/**
 * A render target WITHOUT scope-registered teardown.
 *
 * @remarks
 * For targets whose lifetime does not match a scope — one recreated on
 * every resize, for instance, where a longer-lived owner tracks it and
 * calls {@link dispose}. Prefer {@link make} whenever a scope will do.
 */
export const makeUnsafe = (width: number, height: number): RenderTarget =>
	brand(new THREE.RenderTarget(width, height));

/**
 * Wrap an existing three render target, without registering teardown.
 *
 * @remarks
 * Same caveat as {@link makeUnsafe}: whoever owns it must dispose it.
 */
export const fromRaw = (target: THREE.RenderTarget): RenderTarget =>
	brand(target);

/**
 * Release the target's GPU memory.
 *
 * @remarks
 * Only for targets from {@link makeUnsafe} or {@link fromRaw} — one from
 * {@link make} disposes itself with its scope, and disposing it here would
 * be a double free.
 */
export const dispose = (self: RenderTarget): void => {
	self["~three.renderTarget"].dispose();
};

/**
 * The target's color texture — what you sample to use the rendered result
 * in another pass.
 */
export const texture = (self: RenderTarget): THREE.Texture =>
	self["~three.renderTarget"].texture;

/** The target's width in device pixels. */
export const width = (self: RenderTarget): number =>
	self["~three.renderTarget"].width;

/** The target's height in device pixels. */
export const height = (self: RenderTarget): number =>
	self["~three.renderTarget"].height;

/**
 * Resize the target in place.
 *
 * @remarks
 * three reallocates the underlying GPU textures, so the handle stays valid
 * and nothing needs re-registering with the scope. Contents are not
 * preserved — redraw after resizing.
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
