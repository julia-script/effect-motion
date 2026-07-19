import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Random from "effect/Random";
import * as Instance from "../Instance.js";
import * as Runner from "../Runner.js";
import * as Scene from "../Scene.js";
import * as Time from "../Time.js";
import type { EmitterField, FloatField } from "./constructors.js";
import type { EmitterConfig, Particle } from "./Particle.js";
import type { ParticleField } from "./ParticleField.js";
import * as Prng from "./Prng.js";
import { step } from "./step.js";

type Field = Instance.Of<typeof ParticleField>;

/**
 * Emission model for a single `simulate` call:
 * - `{ burst: n }` — birth `n` particles on the FIRST frame, then none
 * - `{ rate: n }`  — birth `n` particles per second, continuously
 * - `{ fill: n }`  — seed `n` particles EVENLY across the region on the
 *   first frame; they drift and wrap at the edges forever (no source, no
 *   lifecycle). This is the "floating field" model.
 */
export type EmitterEmission =
	| { readonly burst: number }
	| { readonly rate: number };
export type FillEmission = { readonly fill: number };
export type Emission = EmitterEmission | FillEmission;

// how many particles to birth on frame `i` (1-based) of this call
const birthsForFrame = (emission: Emission, i: number, fps: number): number => {
	if ("burst" in emission) {
		return i === 1 ? emission.burst : 0;
	}
	if ("fill" in emission) {
		// fill seeds the whole field once, up front, like a burst
		return i === 1 ? emission.fill : 0;
	}
	// stream: rate/sec → per-frame, accumulating fractional remainder so the
	// long-run average matches `rate` exactly (deterministic, no drift)
	const perFrame = emission.rate / fps;
	const before = Math.floor(perFrame * (i - 1));
	const now = Math.floor(perFrame * i);
	return now - before;
};

// the field's decoded data shape (what Scene.data / the updater see)
type FieldData = typeof ParticleField.data.Type;

// read the field's current config out of its data. `region` is the fill
// area (defaulted to the frame by the caller); particles are positioned in
// the field's LOCAL space (origin 0,0) — the field's x/y transform offsets
// the whole subtree at render time.
const configOf = (
	data: FieldData,
	region: { w: number; h: number },
): EmitterConfig => ({
	x: 0, // emitter origin is the field's own transform; particles are local
	y: 0,
	speed: data.speed,
	angle: data.angle,
	life: data.life,
	size: data.size,
	gravity: data.gravity,
	palette: data.palette,
	region,
	...(data.opacityRange ? { opacity: data.opacityRange } : {}),
	...(data.drift ? { drift: data.drift } : {}),
	...(data.sizeOverLife ? { sizeOverLife: data.sizeOverLife } : {}),
	...(data.opacityOverLife ? { opacityOverLife: data.opacityOverLife } : {}),
});

const run = Effect.fnUntraced(function* (
	instance: Field,
	duration: Duration.Input,
	emission: Emission,
) {
	const runner = yield* Runner.Runner;
	const fps = runner.settings.frameRate;
	const frames = Math.max(1, Time.toFrames(duration, fps));
	const dt = 1 / fps;
	const mode = "fill" in emission ? "fill" : "emit";
	// fill spreads across a region: the field's own if set, else the frame
	const current = yield* Scene.data(instance);
	const region = {
		w: current.region?.w ?? runner.comp.width,
		h: current.region?.h ?? runner.comp.height,
	};

	for (let i = 1; i <= frames; i++) {
		const n = birthsForFrame(emission, i, fps);
		// draw one seed per birth from the scene's seeded Random — the ONLY
		// entropy; each seeds a particle's own independent PRNG
		const seeds: Prng.PrngState[] = [];
		for (let s = 0; s < n; s++) {
			seeds.push(Prng.seedFrom(yield* Random.next));
		}
		yield* Scene.update(instance, (data) => {
			// buffer is the field's private mutable representation; clone the
			// array reference so setDataUnsafe stores a fresh value
			const buffer = [
				...(data.buffer as ReadonlyArray<Particle>),
			] as Particle[];
			step(buffer, data.capacity, dt, seeds, configOf(data, region), mode);
			return { ...data, buffer };
		});
		yield* Scene.tick;
	}
	return instance;
});

const firstArgIsInstance = (args: IArguments) => Instance.isInstance(args[0]);

// the untyped runtime dual; the public `simulate` below narrows it per brand
const simulateImpl = dual<
	(
		duration: Duration.Input,
		emission: Emission,
	) => (instance: Field) => Effect.Effect<Field, never, Runner.Runner>,
	(
		instance: Field,
		duration: Duration.Input,
		emission: Emission,
	) => Effect.Effect<Field, never, Runner.Runner>
>(firstArgIsInstance, (instance, duration, emission) =>
	run(instance, duration, emission),
);

/**
 * Advance a `ParticleField` for `duration`, running its per-frame step
 * (emit, integrate, kill) once per frame and arriving at the phaser once
 * per frame — O(1) on the barrier regardless of live particle count.
 *
 * Dual: `simulate(field, duration, emission)` or
 * `field.pipe(simulate(duration, emission))`. The emission is constrained by
 * how the field was created: a `Particles.emitter(...)` takes `{ burst }` or
 * `{ rate }`, a `Particles.field(...)` takes `{ fill }`. Resolves with the
 * field so calls chain.
 */
export interface Simulate {
	// data-first, branded
	(
		field: EmitterField,
		duration: Duration.Input,
		emission: EmitterEmission,
	): Effect.Effect<EmitterField, never, Runner.Runner>;
	(
		field: FloatField,
		duration: Duration.Input,
		emission: FillEmission,
	): Effect.Effect<FloatField, never, Runner.Runner>;
	// pipeable, branded
	(
		duration: Duration.Input,
		emission: EmitterEmission,
	): (field: EmitterField) => Effect.Effect<EmitterField, never, Runner.Runner>;
	(
		duration: Duration.Input,
		emission: FillEmission,
	): (field: FloatField) => Effect.Effect<FloatField, never, Runner.Runner>;
}

export const simulate = simulateImpl as unknown as Simulate;
