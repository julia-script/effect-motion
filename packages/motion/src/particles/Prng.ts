/**
 * A plain, seedable pseudo-random generator carried BY each particle.
 *
 * Why not the scene's `Random` service? That service is fiber-scoped —
 * reading it needs an Effect and a running fiber. A particle is data in a
 * buffer, not a fiber; it can't `yield*`. So each particle carries its own
 * generator state (a single uint32) advanced by pure arithmetic. The
 * generator's SEED is drawn once from the scene's seeded `Random` at birth
 * (see Particle.emit), so the whole thing stays deterministic under the
 * scene seed while every particle's stream is independent: consuming one
 * particle's randomness cannot shift another's.
 *
 * The algorithm is mulberry32 — a well-known 32-bit generator: one
 * multiply-xor-shift chain per draw, good enough for visual scatter and
 * byte-identical across platforms (all math forced through `| 0` / `>>> 0`
 * so it stays in 32-bit integer space).
 *
 * State is a bare number so it packs into a particle buffer with no object
 * overhead; `next` returns the new state alongside the drawn value rather
 * than mutating, keeping the per-frame step a pure fold.
 */

export type PrngState = number;

/** derive a well-mixed uint32 seed from an arbitrary number in [0, 1) or any float */
export const seedFrom = (value: number): PrngState => {
	// spread the input across the 32-bit range, then mix once so nearby
	// seeds (e.g. 0.0001 apart) don't produce correlated first draws
	let s = (Math.floor(value * 0x100000000) ^ 0x9e3779b9) >>> 0;
	s = Math.imul(s ^ (s >>> 16), 0x45d9f3b) >>> 0;
	return s >>> 0;
};

/** advance the state; returns the next state and a float in [0, 1) */
export const next = (state: PrngState): readonly [PrngState, number] => {
	let t = (state + 0x6d2b79f5) | 0;
	const nextState = t >>> 0;
	t = Math.imul(t ^ (t >>> 15), 1 | t);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	const value = ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
	return [nextState, value];
};

/** advance the state; returns the next state and a float in [min, max) */
export const nextBetween = (
	state: PrngState,
	min: number,
	max: number,
): readonly [PrngState, number] => {
	const [nextState, value] = next(state);
	return [nextState, min + value * (max - min)];
};
