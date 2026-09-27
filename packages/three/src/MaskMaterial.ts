import type { Scope } from "effect";
import { Effect, Predicate } from "effect";
import * as Pipeable from "effect/Pipeable";
import { Line2 } from "three/addons/lines/webgpu/Line2.js";
import * as Tsl from "three/tsl";
import * as THREE from "three/webgpu";

/** A projected alpha field in the current composition's pixel space. */
export interface Factor {
	readonly texture: THREE.Texture;
	readonly mode: "alpha" | "inverse";
	readonly enabled: AlphaNode & { value: number };
}

export const makeFactor = (
	source: THREE.Texture,
	mode: Factor["mode"],
): Factor => ({
	texture: source,
	mode,
	enabled: tsl.uniform(1),
});

export const setEnabled = (factor: Factor, enabled: boolean): void => {
	factor.enabled.value = enabled ? 1 : 0;
};

type DrawableMaterial = THREE.MeshBasicNodeMaterial | THREE.Line2NodeMaterial;

export const TypeId = "~three/MaskMaterial" as const;

/** A retained, disposable pair of mutually exclusive fragment materials. */
export interface Variants extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.opaque": DrawableMaterial;
	readonly "~three.fractional": DrawableMaterial;
}

export const isVariants = (value: unknown): value is Variants =>
	Predicate.hasProperty(value, TypeId);

const brand = (
	opaque: DrawableMaterial,
	fractional: DrawableMaterial,
): Variants => {
	const self: Variants = {
		[TypeId]: TypeId,
		"~three.opaque": opaque,
		"~three.fractional": fractional,
		pipe(...fns: ReadonlyArray<(value: unknown) => unknown>) {
			return Pipeable.pipeArguments(self, fns as unknown as IArguments);
		},
	};
	return self;
};

// Three's fluent node types are too large to expand at this boundary. All
// nodes below are scalar alpha expressions; the cast is local to this actor.
interface AlphaNode {
	readonly a: AlphaNode;
	mul(other: unknown): AlphaNode;
	add(other: unknown): AlphaNode;
	oneMinus(): AlphaNode;
	greaterThan(other: unknown): AlphaNode;
	greaterThanEqual(other: unknown): AlphaNode;
	lessThan(other: unknown): AlphaNode;
	and(other: unknown): AlphaNode;
}

const alpha = (node: unknown): AlphaNode => node as AlphaNode;
type Fn = (...args: ReadonlyArray<unknown>) => AlphaNode;
const tsl = Tsl as unknown as {
	readonly float: Fn;
	readonly materialColor: AlphaNode;
	readonly materialOpacity: AlphaNode;
	readonly screenUV: AlphaNode;
	readonly texture: Fn;
	readonly uniform: (value: number) => AlphaNode & { value: number };
	readonly vec4: Fn;
};

/**
 * Create two material variants that share a drawable's geometry and native
 * fragment depth. Exactly one variant survives its fragment predicate.
 */
export const makeUnsafe = (
	original: DrawableMaterial,
	factors: ReadonlyArray<Factor>,
): Variants => {
	const baseOpacity = alpha(original.opacityNode ?? tsl.materialOpacity);
	const colorAlpha = alpha(
		original.colorNode === null
			? tsl.materialColor.a
			: tsl.vec4(original.colorNode).a,
	);
	let mask = tsl.float(1);
	for (const factor of factors) {
		const coverage = tsl.texture(factor.texture, tsl.screenUV).a;
		const selected = factor.mode === "inverse" ? coverage.oneMinus() : coverage;
		const enabled = alpha(factor.enabled);
		mask = mask.mul(selected.mul(enabled).add(enabled.oneMinus()));
	}
	const effective = colorAlpha.mul(baseOpacity).mul(mask);
	const ordinaryMask =
		original.maskNode === null ? null : alpha(original.maskNode);
	const make = (opaque: boolean): DrawableMaterial => {
		const variant = original.clone() as DrawableMaterial;
		variant.opacityNode = baseOpacity.mul(mask) as never;
		const membership = opaque
			? effective.greaterThanEqual(1 - 1 / 255)
			: effective.greaterThan(0).and(effective.lessThan(1 - 1 / 255));
		variant.maskNode = (
			ordinaryMask === null ? membership : ordinaryMask.and(membership)
		) as never;
		variant.transparent = !opaque;
		variant.depthWrite = opaque;
		variant.userData.seeThrough = !opaque;
		return variant;
	};
	return brand(make(true), make(false));
};

/** Acquire a mask material pair for the current Effect scope. */
export const make = Effect.fnUntraced(function* (
	original: DrawableMaterial,
	factors: ReadonlyArray<Factor>,
): Effect.fn.Return<Variants, never, Scope.Scope> {
	const variants = makeUnsafe(original, factors);
	yield* Effect.addFinalizer(() => Effect.sync(() => dispose(variants)));
	return variants;
});

/** Update ordinary material properties without rebuilding shader graphs. */
export const syncVariants = (
	variants: Variants,
	source: DrawableMaterial,
): void => {
	for (const material of [
		variants["~three.opaque"],
		variants["~three.fractional"],
	]) {
		material.color.copy(source.color);
		material.opacity = source.opacity;
		if (material.map !== source.map) {
			material.map = source.map;
			material.needsUpdate = true;
		}
		material.side = source.side;
		if ("linewidth" in material && "linewidth" in source) {
			material.linewidth = source.linewidth;
		}
	}
};

/** Borrow geometry from a native mesh or fat stroke; the owner keeps it. */
export const makeDrawable = (
	source: THREE.Mesh,
	variants: Variants,
	kind: "opaque" | "fractional",
): THREE.Mesh => {
	const material =
		variants[kind === "opaque" ? "~three.opaque" : "~three.fractional"];
	return source instanceof Line2
		? new Line2(source.geometry, material as THREE.Line2NodeMaterial)
		: new THREE.Mesh(source.geometry, material);
};

/** Whether temporary DoF depth writes have been restored. */
export const fractionalDepthWrite = (variants: Variants): boolean =>
	variants["~three.fractional"].depthWrite;

/** Keep variant transforms and draw order aligned with their owner. */
export const syncDrawable = (variant: THREE.Mesh, source: THREE.Mesh): void => {
	variant.geometry = source.geometry;
	variant.position.copy(source.position);
	variant.quaternion.copy(source.quaternion);
	variant.scale.copy(source.scale);
	variant.renderOrder = source.renderOrder;
	variant.frustumCulled = source.frustumCulled;
	variant.layers.mask = source.layers.mask;
};

/** Release the attachment-owned material pair. */
export const dispose = (variants: Variants): void => {
	variants["~three.opaque"].dispose();
	variants["~three.fractional"].dispose();
};
