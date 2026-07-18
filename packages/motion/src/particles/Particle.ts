import type * as Color from "../Color";
import type * as Prng from "./Prng";

/**
 * A single particle's live state. Held in a flat buffer on the
 * ParticleField instance — never its own entity/instance/fiber. Position
 * and velocity are integrated each frame; `age` counts up to `life`
 * (seconds), at which point the particle is dead and its slot is free.
 *
 * `size` and `color` are the values DRAWN at birth (the particle's
 * baseline); over-life curves modulate them at render time as a function
 * of `age/life` and never mutate these fields.
 *
 * `rng` is the particle's own generator state (see Prng). Tier-2 curves
 * never read it.
 * ponytail: reserved so a future Tier-3 `fn(age, rng)` per-property config
 * is purely additive — no buffer layout change. Drop it if Tier 3 is ruled
 * out for good.
 */
export interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	life: number;
	size: number;
	/** baseline opacity drawn at birth; the over-life curve multiplies it */
	opacity: number;
	color: Color.Color;
	rng: Prng.PrngState;
	/** false = dead slot, reusable by the next emission */
	alive: boolean;
	/**
	 * true for `fill`-mode particles: they never age out and wrap around the
	 * fill region's edges instead of dying, so the field stays evenly
	 * populated forever. Emitter-mode particles leave this false.
	 */
	wrap: boolean;
}

/** an inclusive numeric range `[min, max]`, sampled uniformly at birth */
export type Range = readonly [min: number, max: number];

/** an over-life curve: value goes `from` → `to` across age 0→1, eased */
export interface OverLife {
	readonly from: number;
	readonly to: number;
	/** timing-function name or function; resolved by Timing.resolve */
	readonly ease?: string;
}

/**
 * The emitter configuration an author writes. Ranged props are drawn once
 * per particle at birth; `gravity` is a shared force; over-life curves are
 * deterministic functions of particle age.
 */
export interface EmitterConfig {
	/** emitter origin */
	readonly x: number;
	readonly y: number;
	/** launch speed range (px/sec) */
	readonly speed: Range;
	/** launch angle range (degrees; 0 = up, clockwise-positive) */
	readonly angle: Range;
	/** lifetime range (seconds) */
	readonly life: Range;
	/** birth size range (px radius) */
	readonly size: Range;
	/** birth opacity range (0..1), drawn per particle; the over-life opacity
	 * curve (if any) multiplies this baseline. Omit → every particle 1. */
	readonly opacity?: Range;
	/** shared downward acceleration (px/sec²); not ranged */
	readonly gravity: number;
	/** colors drawn from uniformly at birth */
	readonly palette: ReadonlyArray<Color.Color>;
	/**
	 * fill mode only — the rectangular region particles scatter across and
	 * wrap around, in the field's local coordinates. The animator defaults
	 * this to the whole frame when the author doesn't set it.
	 */
	readonly region?: { readonly w: number; readonly h: number };
	/**
	 * fill mode only — magnitude of each particle's small isotropic drift
	 * velocity (px/sec). Replaces speed+angle launch for evenly-spread
	 * floating fields. `[min, max]` of the speed; direction is uniform.
	 */
	readonly drift?: Range;
	/** optional over-life size curve (multiplies drawn size) */
	readonly sizeOverLife?: OverLife;
	/** optional over-life opacity curve (0..1) */
	readonly opacityOverLife?: OverLife;
}
