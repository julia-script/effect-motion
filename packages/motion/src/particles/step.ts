import type { EmitterConfig, Particle } from "./Particle";
import * as Prng from "./Prng";

/**
 * The per-frame simulation as a PURE fold: `(buffer, dt, births) → buffer`.
 * No external entropy — the only randomness is each particle's own carried
 * PRNG state, seeded at birth. `births` is the list of seeds for particles
 * to birth THIS frame (how many, and their seeds, is decided by the caller
 * — burst vs. stream — and drawn from the scene's seeded Random there, so
 * this function stays pure and testable).
 *
 * Order per frame: integrate + age live particles, kill expired, then emit
 * new ones into free slots (overwriting oldest when full).
 *
 * DETERMINISM: the draw order at birth is FIXED and part of the contract —
 * angle, speed, life, size, color, in that sequence. Changing it shifts
 * seeded output and is a breaking change.
 */

const DEG = Math.PI / 180;

// positive modulo — JS `%` keeps the sign of the dividend, which would let a
// particle drifting off the left edge land at a negative coordinate
const mod = (n: number, m: number): number => ((n % m) + m) % m;

// sample a uniform range from a particle's own rng, threading state
const draw = (
	rng: Prng.PrngState,
	[min, max]: readonly [number, number],
): readonly [Prng.PrngState, number] => Prng.nextBetween(rng, min, max);

// draw the baseline opacity — LAST in the draw order for both births, so
// adding it didn't shift earlier draws. Absent `opacity` config → 1 (and no
// draw is consumed, keeping opacity-less scenes byte-identical).
const drawOpacity = (
	rng: Prng.PrngState,
	config: EmitterConfig,
): readonly [Prng.PrngState, number] =>
	config.opacity ? draw(rng, config.opacity) : [rng, 1];

/** birth one particle from a seed + config (fixed draw order). */
export const birth = (
	seed: Prng.PrngState,
	config: EmitterConfig,
): Particle => {
	let rng = seed;
	let angle: number;
	let speed: number;
	let life: number;
	let size: number;
	let colorPick: number;
	[rng, angle] = draw(rng, config.angle);
	[rng, speed] = draw(rng, config.speed);
	[rng, life] = draw(rng, config.life);
	[rng, size] = draw(rng, config.size);
	[rng, colorPick] = Prng.nextBetween(rng, 0, config.palette.length);
	let opacity: number;
	[rng, opacity] = drawOpacity(rng, config);
	// angle 0 = straight up; clockwise-positive
	const rad = angle * DEG;
	const color =
		config.palette[
			Math.min(config.palette.length - 1, Math.floor(colorPick))
		] ?? "white";
	return {
		x: config.x,
		y: config.y,
		vx: Math.sin(rad) * speed,
		vy: -Math.cos(rad) * speed,
		age: 0,
		life,
		size,
		opacity,
		color,
		rng,
		alive: true,
		wrap: false,
	};
};

/**
 * Birth a `fill`-mode particle: scattered at a random point in the region
 * (not at the origin), given a small isotropic drift velocity (not a
 * launch), and marked to wrap forever instead of aging out. This is what
 * makes an evenly-spread floating field rather than a fountain. Same fixed
 * draw order — position x, position y, drift direction, drift speed, size,
 * color — so seeded output is stable.
 */
export const birthFill = (
	seed: Prng.PrngState,
	config: EmitterConfig,
): Particle => {
	const w = config.region?.w ?? 0;
	const h = config.region?.h ?? 0;
	const drift = config.drift ?? [0, 0];
	let rng = seed;
	let px: number;
	let py: number;
	let dir: number;
	let dspeed: number;
	let size: number;
	let colorPick: number;
	[rng, px] = Prng.nextBetween(rng, 0, w);
	[rng, py] = Prng.nextBetween(rng, 0, h);
	[rng, dir] = Prng.nextBetween(rng, 0, 360);
	[rng, dspeed] = draw(rng, drift);
	[rng, size] = draw(rng, config.size);
	[rng, colorPick] = Prng.nextBetween(rng, 0, config.palette.length);
	let opacity: number;
	[rng, opacity] = drawOpacity(rng, config);
	const rad = dir * DEG;
	const color =
		config.palette[
			Math.min(config.palette.length - 1, Math.floor(colorPick))
		] ?? "white";
	return {
		// scattered across the region, offset by the field's own origin
		x: config.x + px,
		y: config.y + py,
		vx: Math.cos(rad) * dspeed,
		vy: Math.sin(rad) * dspeed,
		age: 0,
		life: Number.POSITIVE_INFINITY,
		size,
		opacity,
		color,
		rng,
		alive: true,
		wrap: true,
	};
};

/**
 * Advance the buffer one frame. `dt` is seconds per frame. `seeds` are the
 * per-particle seeds to birth this frame (already drawn upstream). The
 * buffer is mutated in place and returned — it is the field's private
 * representation, owned by one instance, so in-place is safe and flat.
 * ponytail: array-of-structs, mutated in place. SoA + typed arrays is the
 * upgrade path if a capacity-target benchmark shows this is the wall.
 */
export const step = (
	buffer: Particle[],
	capacity: number,
	dt: number,
	seeds: ReadonlyArray<Prng.PrngState>,
	config: EmitterConfig,
	mode: "emit" | "fill" = "emit",
): Particle[] => {
	const spawn = mode === "fill" ? birthFill : birth;
	// integrate live particles. Emitter particles age and die; fill (wrap)
	// particles never age and instead wrap around the region's edges, so an
	// evenly-spread field stays populated forever.
	const rw = config.region?.w ?? 0;
	const rh = config.region?.h ?? 0;
	for (const p of buffer) {
		if (!p.alive) {
			continue;
		}
		p.vy += config.gravity * dt;
		p.x += p.vx * dt;
		p.y += p.vy * dt;
		if (p.wrap) {
			// wrap within the region, which sits at the field origin (config.x/y)
			if (rw > 0) {
				p.x = config.x + mod(p.x - config.x, rw);
			}
			if (rh > 0) {
				p.y = config.y + mod(p.y - config.y, rh);
			}
			continue;
		}
		p.age += dt;
		if (p.age >= p.life) {
			p.alive = false;
		}
	}

	// emit into free slots; when none, overwrite the oldest live particle
	for (const seed of seeds) {
		const fresh = spawn(seed, config);
		const deadIdx = buffer.findIndex((p) => !p.alive);
		if (deadIdx !== -1) {
			buffer[deadIdx] = fresh;
		} else if (buffer.length < capacity) {
			buffer.push(fresh);
		} else {
			// full and all alive: overwrite the oldest (highest age)
			let oldest = 0;
			for (let i = 1; i < buffer.length; i++) {
				// biome-ignore lint/style/noNonNullAssertion: indices are in range
				if (buffer[i]!.age > buffer[oldest]!.age) {
					oldest = i;
				}
			}
			buffer[oldest] = fresh;
		}
	}

	return buffer;
};

/** count of currently-live particles */
export const liveCount = (buffer: ReadonlyArray<Particle>): number =>
	buffer.reduce((n, p) => (p.alive ? n + 1 : n), 0);
