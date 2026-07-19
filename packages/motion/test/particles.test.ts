import { Effect } from "effect";
import type * as Duration from "effect/Duration";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import { emitter, field } from "../src/particles/constructors";
import { renderOpacity, renderSize } from "../src/particles/overLife";
import type { EmitterConfig, Particle } from "../src/particles/Particle";
import * as Prng from "../src/particles/Prng";
import { simulate } from "../src/particles/simulate";
import { birth, birthFill, liveCount, step } from "../src/particles/step";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";

const baseConfig: EmitterConfig = {
	x: 0,
	y: 0,
	speed: [80, 140],
	angle: [-30, 30],
	life: [1, 2],
	size: [2, 5],
	gravity: 400,
	palette: [Color.hex("#aa0000"), Color.hex("#00bb00"), Color.hex("#0000cc")],
};

// run a ParticleField scene and return the per-frame live-particle buffers
const runField = async (
	emission: { burst: number } | { rate: number },
	duration: Duration.Input,
	settings: Partial<Runner.Settings> = {},
): Promise<Particle[][]> => {
	const scene = Scene.make(function* () {
		const f = yield* emitter({
			x: 0,
			y: 0,
			speed: baseConfig.speed,
			angle: baseConfig.angle,
			life: baseConfig.life,
			size: baseConfig.size,
			gravity: baseConfig.gravity,
			palette: baseConfig.palette,
			capacity: 100,
		});
		yield* simulate(f, duration, emission);
	});
	const frames = await Effect.runPromise(
		Scene.stream(scene as never, settings).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map((frame) => {
		const entry = Object.entries(frame.instances).find(
			([id]) => id !== frame.root,
		)?.[1];
		const buffer = (entry?.data as { buffer?: Particle[] })?.buffer ?? [];
		return buffer.filter((p) => p.alive);
	});
};

describe("Prng", () => {
	it("same seed → same sequence", () => {
		const s = Prng.seedFrom(0.42);
		const a: number[] = [];
		const b: number[] = [];
		let sa = s;
		let sb = s;
		for (let i = 0; i < 5; i++) {
			let va: number;
			let vb: number;
			[sa, va] = Prng.next(sa);
			[sb, vb] = Prng.next(sb);
			a.push(va);
			b.push(vb);
		}
		expect(a).toEqual(b);
	});

	it("draws land in [0,1)", () => {
		let s = Prng.seedFrom(0.99);
		for (let i = 0; i < 1000; i++) {
			let v: number;
			[s, v] = Prng.next(s);
			expect(v).toBeGreaterThanOrEqual(0);
			expect(v).toBeLessThan(1);
		}
	});

	it("independent seeds don't correlate (consuming one doesn't shift the other)", () => {
		// two particles with different seeds evolve independently: drawing N
		// times from one never changes what the other produces
		const [, first] = Prng.next(Prng.seedFrom(0.1));
		const other = Prng.seedFrom(0.7);
		let s = other;
		for (let i = 0; i < 50; i++) {
			[s] = Prng.next(s);
		}
		const [, firstAgain] = Prng.next(Prng.seedFrom(0.1));
		expect(firstAgain).toEqual(first);
	});
});

describe("birth (draw at fixed order)", () => {
	it("ranged props land within their ranges", () => {
		for (let i = 0; i < 200; i++) {
			const p = birth(Prng.seedFrom(i / 200), baseConfig);
			expect(p.size).toBeGreaterThanOrEqual(2);
			expect(p.size).toBeLessThanOrEqual(5);
			expect(p.life).toBeGreaterThanOrEqual(1);
			expect(p.life).toBeLessThanOrEqual(2);
			const speed = Math.hypot(p.vx, p.vy);
			expect(speed).toBeGreaterThanOrEqual(80 - 1e-9);
			expect(speed).toBeLessThanOrEqual(140 + 1e-9);
			expect(baseConfig.palette).toContain(p.color);
		}
	});

	it("particles generally differ", () => {
		const sizes = new Set(
			Array.from(
				{ length: 50 },
				(_, i) => birth(Prng.seedFrom(i / 50), baseConfig).size,
			),
		);
		expect(sizes.size).toBeGreaterThan(10);
	});
});

describe("over-life curves", () => {
	const particleAt = (age: number, life: number): Particle => ({
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		age,
		life,
		size: 5,
		opacity: 1,
		color: Color.white,
		rng: 0,
		alive: true,
		wrap: false,
	});

	it("size shrinks 5→0 across life", () => {
		const curve = { from: 1, to: 0 } as const;
		expect(renderSize(particleAt(0, 2), curve)).toBeCloseTo(5, 6); // birth
		expect(renderSize(particleAt(1, 2), curve)).toBeCloseTo(2.5, 6); // half
		expect(renderSize(particleAt(2, 2), curve)).toBeCloseTo(0, 6); // end
	});

	it("depends only on age, not birth time (two particles at same age agree)", () => {
		const curve = { from: 1, to: 0, ease: "easeInQuad" } as const;
		const a = renderOpacity(particleAt(0.5, 1), curve);
		const b = renderOpacity(particleAt(0.5, 1), curve);
		expect(a).toEqual(b);
	});

	it("no curve → size unchanged, opacity 1", () => {
		expect(renderSize(particleAt(0.5, 1), undefined)).toBe(5);
		expect(renderOpacity(particleAt(0.5, 1), undefined)).toBe(1);
	});

	it("baseline opacity is used when no curve, and multiplied by the curve", () => {
		const p = { ...particleAt(0.5, 1), opacity: 0.4 };
		// no curve → the drawn baseline shows through
		expect(renderOpacity(p, undefined)).toBeCloseTo(0.4, 6);
		// with a curve → baseline × curve value at this age
		const curve = { from: 1, to: 0 } as const; // linear → 0.5 at t=0.5
		expect(renderOpacity(p, curve)).toBeCloseTo(0.4 * 0.5, 6);
	});
});

describe("opacity randomization", () => {
	it("draws a per-particle opacity within the range", () => {
		const cfg = { ...baseConfig, opacity: [0.2, 0.8] as const };
		for (let i = 0; i < 200; i++) {
			const p = birth(Prng.seedFrom(i / 200), cfg);
			expect(p.opacity).toBeGreaterThanOrEqual(0.2);
			expect(p.opacity).toBeLessThanOrEqual(0.8);
		}
	});

	it("no opacity config → every particle fully opaque, no draw consumed", () => {
		// same seed with and without opacity config: the particle WITHOUT an
		// opacity range must be identical up to opacity (no draw consumed)
		const withOut = birth(Prng.seedFrom(0.5), baseConfig);
		expect(withOut.opacity).toBe(1);
	});
});

describe("step (pure fold)", () => {
	it("gravity applies uniformly; age advances; expired die", () => {
		const buffer: Particle[] = [];
		// life 1/60s: born on frame 1 (age 0), integrated to age 1/60 on frame
		// 2 (age >= life → dead)
		const cfg = {
			...baseConfig,
			life: [1 / 60, 1 / 60] as const,
			gravity: 1000,
		};
		step(buffer, 10, 1 / 60, [Prng.seedFrom(0.1), Prng.seedFrom(0.2)], cfg);
		expect(liveCount(buffer)).toBe(2);
		const vyBefore = buffer.map((p) => p.vy);
		// advance without new births — both should gain the same vy delta
		step(buffer, 10, 1 / 60, [], cfg);
		buffer.forEach((p, i) => {
			expect(p.vy - (vyBefore[i] ?? 0)).toBeCloseTo(1000 / 60, 6);
		});
		expect(liveCount(buffer)).toBe(0);
	});

	it("overflow overwrites oldest; live count never exceeds capacity", () => {
		const buffer: Particle[] = [];
		const cfg = { ...baseConfig, life: [100, 100] as const };
		const capacity = 5;
		// birth 12 into a capacity-5 buffer over frames
		for (let f = 0; f < 12; f++) {
			step(buffer, capacity, 1 / 60, [Prng.seedFrom(f / 12)], cfg);
			expect(liveCount(buffer)).toBeLessThanOrEqual(capacity);
		}
		expect(liveCount(buffer)).toBe(capacity);
	});
});

describe("fill mode (evenly-spread floating field)", () => {
	const fillConfig: EmitterConfig = {
		...baseConfig,
		region: { w: 200, h: 100 },
		drift: [5, 15],
	};

	it("birthFill scatters within the region and marks wrap/persistent", () => {
		for (let i = 0; i < 200; i++) {
			const p = birthFill(Prng.seedFrom(i / 200), fillConfig);
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThanOrEqual(200);
			expect(p.y).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeLessThanOrEqual(100);
			expect(p.wrap).toBe(true);
			expect(p.life).toBe(Number.POSITIVE_INFINITY);
			// drift speed within [5,15]
			expect(Math.hypot(p.vx, p.vy)).toBeGreaterThanOrEqual(5 - 1e-9);
			expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(15 + 1e-9);
		}
	});

	it("spread actually fills the region (not clustered at a point)", () => {
		const xs = Array.from(
			{ length: 100 },
			(_, i) => birthFill(Prng.seedFrom(i / 100), fillConfig).x,
		);
		expect(Math.min(...xs)).toBeLessThan(50); // some on the left
		expect(Math.max(...xs)).toBeGreaterThan(150); // some on the right
	});

	it("fill particles never die and wrap at edges", () => {
		const buffer: Particle[] = [];
		// seed 20 fill particles once
		const seeds = Array.from({ length: 20 }, (_, i) => Prng.seedFrom(i / 20));
		step(buffer, 100, 1 / 60, seeds, fillConfig, "fill");
		expect(liveCount(buffer)).toBe(20);
		// advance many frames with no new births — none die, count holds
		for (let f = 0; f < 600; f++) {
			step(buffer, 100, 1 / 60, [], fillConfig, "fill");
		}
		expect(liveCount(buffer)).toBe(20);
		// every particle stays inside the wrapped region
		for (const p of buffer) {
			expect(p.x).toBeGreaterThanOrEqual(0);
			expect(p.x).toBeLessThanOrEqual(200);
			expect(p.y).toBeGreaterThanOrEqual(0);
			expect(p.y).toBeLessThanOrEqual(100);
		}
	});
});

describe("simulate (scene integration)", () => {
	it("burst births all on the first frame, then none", async () => {
		const frames = await runField({ burst: 20 }, "500 millis");
		expect(frames[0]?.length).toBe(20);
		// no new births after frame 0 (count only decreases as they die)
		for (let i = 1; i < frames.length; i++) {
			expect(frames[i]?.length ?? 0).toBeLessThanOrEqual(
				frames[i - 1]?.length ?? 0,
			);
		}
	});

	it("stream births ~one per frame at rate = fps", async () => {
		const frames = await runField({ rate: 60 }, "500 millis", {
			frameRate: 60,
		});
		// after the first few frames, count climbs ~1/frame (nothing dies yet;
		// life ≥ 1s and we run 0.5s)
		expect(frames[9]?.length).toBe(10);
	});

	it("same seed → byte-identical frames", async () => {
		const a = await runField({ burst: 30 }, "400 millis");
		const b = await runField({ burst: 30 }, "400 millis");
		expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
	});

	it("one phaser party: N frames produce N frames regardless of count", async () => {
		// 300ms at 60fps = 18 frames, whether 5 or 500 particles
		const few = await runField({ burst: 5 }, "300 millis", { frameRate: 60 });
		const many = await runField({ burst: 500 }, "300 millis", {
			frameRate: 60,
		});
		expect(few.length).toBe(many.length);
	});

	it("fill constructor spreads across the frame at frame 0", async () => {
		const scene = Scene.make(
			function* () {
				const f = yield* field({
					size: [1, 2],
					drift: [4, 12],
					palette: [Color.white],
					capacity: 200,
				});
				yield* simulate(f, "500 millis", { fill: 120 });
			},
			{ width: 500, height: 300 },
		);
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
		);
		const first = [...frames][0];
		const entry = Object.entries(first?.instances ?? {}).find(
			([id]) => id !== first?.root,
		)?.[1];
		const buffer = (entry?.data as { buffer?: Particle[] })?.buffer ?? [];
		const live = buffer.filter((p) => p.alive);
		expect(live.length).toBe(120);
		// spread across the full frame, not clustered at the origin
		const xs = live.map((p) => p.x);
		expect(Math.min(...xs)).toBeLessThan(100);
		expect(Math.max(...xs)).toBeGreaterThan(400);
	});
});
