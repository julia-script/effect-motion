import type * as Effect from "effect/Effect";
import type * as Color from "../Color.js";
import type * as Instance from "../Instance.js";
import type * as Runner from "../Runner.js";
import * as Scene from "../Scene.js";
import type { Range } from "./Particle.js";
import { ParticleField } from "./ParticleField.js";

/**
 * Two typed front doors onto the SAME `ParticleField` entity. The field's
 * emission model is chosen at `simulate`, but the properties that make sense
 * differ by model — a fountain has speed/angle/life, a floating field has
 * drift/region. These constructors gate which props an author may set and
 * brand the returned instance so `simulate` only accepts the matching
 * emission (see simulate.ts). The brand is compile-time only; both build an
 * ordinary ParticleField instance with identical runtime data.
 */

declare const EmitterBrand: unique symbol;
declare const FloatBrand: unique symbol;

type BaseField = Instance.Of<typeof ParticleField>;

/** an emitter (source) field — simulate with `{ burst }` or `{ rate }` */
export type EmitterField = BaseField & { readonly [EmitterBrand]: true };
/** a floating field — simulate with `{ fill }` */
export type FloatField = BaseField & { readonly [FloatBrand]: true };

/** an over-life curve `{ from, to, ease? }` (see Particle.OverLife) */
interface OverLifeInput {
	readonly from: number;
	readonly to: number;
	readonly ease?: string;
}

/** props shared by both field kinds */
interface CommonInput {
	readonly x?: number;
	readonly y?: number;
	/** birth size range (px radius) */
	readonly size?: Range;
	/** per-particle birth opacity range (0..1); over-life curve multiplies it */
	readonly opacityRange?: Range;
	/** colors drawn from uniformly at birth */
	readonly palette?: ReadonlyArray<Color.Color>;
	/** shared downward acceleration (px/sec²) */
	readonly gravity?: number;
	readonly sizeOverLife?: OverLifeInput;
	readonly opacityOverLife?: OverLifeInput;
	/** fixed particle capacity */
	readonly capacity?: number;
}

/** props unique to a source emitter (launched particles with a lifetime) */
export interface EmitterInput extends CommonInput {
	/** launch speed range (px/sec) */
	readonly speed: Range;
	/** launch angle range (degrees; 0 = up, clockwise-positive) */
	readonly angle: Range;
	/** lifetime range (seconds) */
	readonly life: Range;
}

/** props unique to a floating field (scattered, drifting, wrapping) */
export interface FieldInput extends CommonInput {
	/** drift speed range (px/sec); direction is uniform-random */
	readonly drift: Range;
	/** spread/wrap region in local coords; defaults to the whole frame */
	readonly region?: { readonly w: number; readonly h: number };
}

/**
 * Create a source emitter field. Simulate it with `{ burst: n }` (all at
 * once) or `{ rate: n }` (a continuous stream).
 */
export const emitter = (
	props: EmitterInput,
): Effect.Effect<EmitterField, never, Runner.Runner> =>
	// the entity schema is one struct with defaults; the branded return type
	// is a compile-time cast, runtime data is a plain ParticleField
	Scene.instantiate(ParticleField, props) as Effect.Effect<
		EmitterField,
		never,
		Runner.Runner
	>;

/**
 * Create a floating field: particles spread evenly across the region,
 * drifting and wrapping at the edges. Simulate it with `{ fill: n }`.
 */
export const field = (
	props: FieldInput,
): Effect.Effect<FloatField, never, Runner.Runner> =>
	Scene.instantiate(ParticleField, props) as Effect.Effect<
		FloatField,
		never,
		Runner.Runner
	>;
