import * as Timing from "../Timing";
import type { OverLife, Particle } from "./Particle";

/**
 * Evaluate an over-life curve at a particle's current age. Purely a
 * function of `age/life` (clamped to [0,1]) eased by the configured timing
 * function — no randomness after birth, so two particles at the same age
 * always agree.
 */
export const evalOverLife = (curve: OverLife, particle: Particle): number => {
	const t = particle.life > 0 ? Math.min(1, particle.age / particle.life) : 1;
	// ease is stored as a plain string (schema data); resolve validates it
	const eased = Timing.resolve((curve.ease ?? "linear") as Timing.TimingInput)(
		t,
	);
	return curve.from + (curve.to - curve.from) * eased;
};

/** rendered radius: drawn size, optionally scaled by the size-over-life curve */
export const renderSize = (
	particle: Particle,
	curve: OverLife | undefined,
): number =>
	curve ? particle.size * evalOverLife(curve, particle) : particle.size;

/**
 * Rendered opacity: the particle's baseline opacity (drawn at birth),
 * multiplied by the opacity-over-life curve when one is set. So a field can
 * randomize per-particle opacity, fade over life, or both.
 */
export const renderOpacity = (
	particle: Particle,
	curve: OverLife | undefined,
): number =>
	curve ? particle.opacity * evalOverLife(curve, particle) : particle.opacity;
