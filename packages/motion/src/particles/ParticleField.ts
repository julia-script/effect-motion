import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Color from "../Color.js";
import * as Legacy from "./legacy.js";

/**
 * A ParticleField is ONE entity/instance backing many particles. Its data
 * holds the emitter config plus a fixed-capacity buffer of live particle
 * state; the `simulate` animator advances it one frame at a time, so N
 * particles cost one fiber and one phaser party — O(1) on the barrier.
 *
 * The buffer lives in the entity data (so the Runner owns it like any
 * instance state and it round-trips through the seeded, deterministic
 * scene). Its representation is the field's private business — see
 * particles/step.ts.
 */

const Range = Schema.Tuple([Schema.Number, Schema.Number]);

// a Range with a constructor default, so a mode that doesn't use this prop
// can omit it and still construct valid field data
const defaultedRange = (value: readonly [number, number]) =>
	Range.pipe(
		Schema.withConstructorDefault(
			Effect.sync(() => [value[0], value[1]] as [number, number]),
		),
	);

const OverLifeSchema = Schema.Struct({
	from: Schema.Number,
	to: Schema.Number,
	ease: Schema.optionalKey(Schema.String),
});

const ParticleSchema = Schema.Struct({
	x: Schema.Number,
	y: Schema.Number,
	vx: Schema.Number,
	vy: Schema.Number,
	age: Schema.Number,
	life: Schema.Number,
	size: Schema.Number,
	opacity: Schema.Number,
	color: Color.Color,
	rng: Schema.Number,
	alive: Schema.Boolean,
	wrap: Schema.Boolean,
});

export const ParticleField = Legacy.make(
	"particles/ParticleField",
	{
		// emitter origin doubles as the field's position (x/y), so the field
		// participates in the position trait like any shape
		...Legacy.position,
		...Legacy.opacity,
		// emitter config. speed/angle/life are emitter-mode props; the typed
		// `emitter()`/`field()` constructors gate which an author may set, but
		// the underlying schema defaults them so ONE struct serves both modes.
		speed: defaultedRange([0, 0]),
		angle: defaultedRange([0, 0]),
		life: defaultedRange([1, 1]),
		size: defaultedRange([2, 2]),
		// per-particle birth opacity range (0..1), drawn at birth; the over-life
		// opacity curve multiplies it. Named distinctly from the field's own
		// `opacity` (the ~opacity trait above, which fades the whole field).
		opacityRange: defaultedRange([1, 1]),
		gravity: Legacy.defaultedNumber(0),
		palette: Schema.Array(Color.Color).pipe(
			Schema.withConstructorDefault(Effect.sync(() => [Color.white])),
		),
		// fill mode: the region particles spread across and wrap within
		// (defaults to the frame in `simulate`) and their drift speed range
		region: Schema.optionalKey(
			Schema.Struct({ w: Schema.Number, h: Schema.Number }),
		),
		drift: Schema.optionalKey(Range),
		sizeOverLife: Schema.optionalKey(OverLifeSchema),
		opacityOverLife: Schema.optionalKey(OverLifeSchema),
		// lifecycle state
		capacity: Legacy.defaultedNumber(1024),
		buffer: Schema.Array(ParticleSchema).pipe(
			Schema.withConstructorDefault(Effect.sync(() => [])),
		),
	},
	{
		"~position": Legacy.positionLens(),
		"~opacity": Legacy.opacityLens(),
	},
);
