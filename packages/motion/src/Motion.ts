/**
 * Duration-based animation: the animators that interpolate a value over a
 * span of scene time, paced by an easing curve.
 *
 * The module is two layers over one engine:
 *
 * - **raw** — {@link tween} / {@link tweenTo} interpolate numeric fields BY
 *   NAME (`radius`, `width`, `fontSize`), whatever the entity's schema
 *   declares.
 * - **semantic** — {@link move} / {@link moveTo} and {@link fade} /
 *   {@link fadeTo} speak in concepts rather than field names, and are what
 *   you should reach for when one exists: geometry is relative to
 *   `position`, so moving a Line translates both endpoints and moving a
 *   Group carries its whole subtree, with no per-entity handling.
 *
 * Every animator ships as a base/To pair — `verbTo` starts from the
 * instance's CURRENT value, `verb` takes an explicit origin — and each is a
 * dual, callable data-first (`moveTo(circle, …)`) or pipeable
 * (`circle.pipe(moveTo(…))`). They resolve with the instance, so chains
 * compose. For durationless motion whose length emerges from a simulation,
 * see `Physics`.
 *
 * Timing is frame-exact: a `duration` is converted to whole frames at the
 * runner's frame rate, and the last frame receives exactly the target value
 * for any easing with f(1) = 1 — a tween never lands "almost" on its
 * target. A zero-length duration still consumes one frame.
 *
 * @example
 * Chain a raw tween into two semantic animators. `1 second` at 30fps is 30
 * animation frames, and `radius`/`position`/`opacity` all land exactly.
 * ```typescript
 * import * as Motion from "effect-motion/Motion";
 * import * as Scene from "effect-motion/Scene";
 *
 * const scene = Scene.make(function* () {
 * 	const dot = yield* Scene.instantiate("Circle", { radius: 4 });
 * 	yield* dot.pipe(
 * 		Motion.tweenTo({ radius: 40 }, "1 second", "easeOutCubic"),
 * 		Motion.moveTo({ x: 300 }, "1 second"),
 * 		Motion.fadeTo(0, "500 millis"),
 * 	);
 * });
 * ```
 */
import type * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Effectable from "effect/Effectable";
import { dual } from "effect/Function";
import * as Color from "./Color.js";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import * as Runner from "./Runner.js";
import * as Scene from "./Scene.js";
import * as Time from "./Time.js";
import * as Timing from "./Timing.js";

export const color = (to: Color.Color, mode: Color.InterpolationMode) => {
	return (from: Color.Color, t: number) => Color.mix(from, to, t, mode);
};
type ColorInterpolator = (from: Color.Color, t: number) => Color.Color;
export type InterpolableValue = number | Color.Color;

// optional numeric fields (schema optionalKey, e.g. the camera's
// z/focalLength) are tweenable too — strip undefined before matching
type InterpolableKeys<T> = {
	[K in keyof T]-?: NonNullable<T[K]> extends InterpolableValue ? K : never;
}[keyof T];

export type InterpolableOnly<T> = Pick<T, InterpolableKeys<T>>;
type InterpolableOrInterpolator<T> = {
	[K in keyof T]-?: NonNullable<T[K]> extends number
		? number
		: NonNullable<T[K]> extends Color.Color
			? Color.Color | ColorInterpolator
			: never;
};

// extrapolating on purpose: eased t goes outside [0, 1] for back/elastic
const lerpNumber = (from: number, to: number, t: number) =>
	from + (to - from) * t;

const lerpColor = (
	from: Color.Color,
	to: Color.Color,
	t: number,
	mode: Color.InterpolationMode,
) => {
	return Color.mix(from, to, t, mode);
};

/**
 * The interpolation engine: from `from` to `to` over `duration`, calling
 * `fn` with the eased value once per frame (each step ends in a
 * Scene.tick). The last call receives exactly `to` for any timing with
 * f(1) = 1; a zero-length duration still takes one frame. Internal —
 * public animators apply to instances.
 */
const interpolate = Effect.fnUntraced(function* <
	T extends Record<string, InterpolableValue>,
	A,
	E,
	R,
>(
	from: T,
	to: T,
	duration: Duration.Input,
	fn: (value: T) => Effect.Effect<A, E, R>,
	timing: Timing.TimingInput = "linear",
) {
	const runner = yield* Runner.Runner;
	const timingFn = Timing.resolve(timing);
	const keys = Object.keys(from);
	const frames = Math.max(
		1,
		Time.toFrames(duration, runner.settings.frameRate),
	);
	for (let i = 1; i <= frames; i++) {
		const t = timingFn(i / frames);
		const value: Record<string, InterpolableValue | ColorInterpolator> = {};
		for (const key of keys) {
			const fromValue = from[key];
			const toValue = to[key];
			if (typeof toValue === "number") {
				value[key] = lerpNumber(from[key] as number, to[key] as number, t);
			} else if (typeof toValue === "function") {
				const interpolator = toValue as ColorInterpolator;
				value[key] = interpolator(fromValue as Color.Color, t);
			} else {
				value[key] = lerpColor(
					fromValue as Color.Color,
					toValue as Color.Color,
					t,
					"lab",
				);
			}
		}
		yield* fn(value as T);
		yield* Scene.tick;
	}
});

/**
 * What {@link tween} / {@link tweenTo} accept as an endpoint: the fields to
 * animate and their values.
 *
 * @remarks
 * Two forms. A plain object states targets literally. A function receives
 * the entity's data at animation start and computes them, which is how you
 * express a target relative to where the entity already is (`data.radius *
 * 2`) without reading it out in a separate step.
 *
 * Only numeric and Color fields of the entity are addressable — those are
 * the ones that can be interpolated.
 *
 * @typeParam Tag - The entity tag, which determines the available fields.
 */
export type Target<Tag extends Entity.EntityTag> =
	| Partial<InterpolableOrInterpolator<Entity.EntityByTag<Tag>>>
	| ((
			data: Entity.EntityByTag<Tag>,
	  ) => Partial<InterpolableOrInterpolator<Entity.EntityByTag<Tag>>>);

// InterpolableOnly of an opaque Entity.EntityByTag<Tag> can't be proven
// index-compatible with Record<string, number>; the runtime shape is
// guaranteed by the Target type, so cast once here.
export const resolveTarget = <Tag extends Entity.EntityTag>(
	target: Target<Tag>,
	current: Entity.EntityByTag<Tag>,
): Record<string, number> =>
	(typeof target === "function"
		? target(current)
		: target) as unknown as Record<string, number>;

// start values for the keys of `target`: from `explicitFrom` where given,
// otherwise from the instance's current data
export const startValues = (
	current: unknown,
	target: Record<string, number>,
	explicitFrom: Record<string, number>,
): Record<string, number> => {
	const start: Record<string, number> = {};
	for (const key of Object.keys(target)) {
		const from = explicitFrom[key] ?? (current as Record<string, number>)[key];
		// an optional field that was never set has no start value — lerping
		// from undefined would silently produce NaN frames; die loudly instead
		if (from === undefined) {
			throw new Error(
				`tween: "${key}" has no current value to start from — pass an explicit from`,
			);
		}
		start[key] = from;
	}
	return start;
};

const animate = Effect.fnUntraced(function* <
	Tag extends Entity.EntityTag,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Tag, E, R>,
	from: Target<Tag> | undefined,
	to: Target<Tag>,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flattenInstance(instanceOrEffect);
	const current = yield* Scene.data(instance);
	const target = resolveTarget(to, current);
	const start = startValues(
		current,
		target,
		from === undefined ? {} : resolveTarget(from, current),
	);
	yield* interpolate(
		start,
		target,
		duration,
		(value) =>
			// Entity.EntityByTag<Tag> is opaque to TS, so spread is disallowed — assign + cast
			Scene.update(
				instance,
				(data) => Object.assign({}, data, value) as Entity.EntityByTag<Tag>,
			),
		timing,
	);
	return instance;
});

// dispatch on the first argument, not arity: the optional trailing
// `timing` makes call arity ambiguous between the two forms
const firstArgIsInstance = (args: IArguments) => Instance.isInstance(args[0]);

/**
 * Interpolate numeric fields of an instance to `to` over `duration`,
 * starting from whatever they currently are.
 *
 * @remarks
 * This is the RAW layer: fields are addressed by their schema name, so
 * `tweenTo` reaches everything the semantic animators don't cover —
 * `radius`, `width`, `height`, `fontSize`, `strokeWidth`, a Camera's
 * `focalLength`. Prefer {@link moveTo} / {@link fadeTo} where they apply;
 * they move an entity as a unit, which a per-field tween cannot.
 *
 * Only the fields named in `to` are touched; the rest are left alone.
 * `to` may also be a function of the current data, for a target computed
 * at animation start. Colors are interpolable too, mixed through Lab by
 * default.
 *
 * The final frame receives exactly `to` (for any easing with f(1) = 1), so
 * a chain of tweens never accumulates drift. A field that has no current
 * value — an optional one never set — is a loud defect rather than a
 * silent NaN; pass an explicit origin with {@link tween} instead.
 *
 * @param to - The fields to animate and their target values.
 * @param duration - How long, in scene time; rounded to whole frames at
 *   the runner's frame rate. A zero duration still takes one frame.
 * @param timing - An easing name from `Timing.timingFunctions`, or your own
 *   `(t: number) => number`.
 * @defaultValue `timing` — `"linear"`
 * @returns The instance, so animators chain.
 * @see {@link tween} to specify the starting value explicitly.
 *
 * @example
 * Grow a circle's radius, then shrink it back with a different curve.
 * ```typescript
 * yield* dot.pipe(
 * 	Motion.tweenTo({ radius: 40 }, "600 millis", "easeOutBack"),
 * 	Motion.tweenTo({ radius: 4 }, "400 millis", "easeInQuad"),
 * );
 * ```
 */
export const tweenTo = dual<
	<Tag extends Entity.EntityTag>(
		to: Target<Tag>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Entity.EntityTag, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		to: Target<Tag>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animate(instance, undefined, to, duration, timing),
);

/**
 * The escape hatch: run `fn` once per frame with the eased progress and the
 * entity's current data, and use whatever it returns as the new data.
 *
 * @remarks
 * Reach for `drive` when fields must move TOGETHER in a way independent
 * tweens cannot express. Tweening `x` and `y` separately gives you a
 * straight line; a circular orbit needs both derived from one angle, and
 * that coupling is what this provides. It is the primitive `Camera.orbit`
 * and `Camera.dolly` are themselves built on.
 *
 * `fn` must be pure — it receives only `(t, data)` and returns new data, so
 * a scene stays reproducible frame-for-frame. Reading a clock or a random
 * number here is what breaks determinism. `t` is the EASED parameter, so a
 * non-linear `timing` reshapes the pacing without `fn` knowing.
 *
 * The final frame receives exactly `t = 1` for any easing with f(1) = 1, so
 * the motion lands precisely on whatever `fn(1, …)` computes.
 *
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function; applied to `t` before `fn`
 *   sees it.
 * @param fn - Pure `(t, data) => data`, called once per frame.
 * @returns The instance, so animators chain.
 *
 * @example
 * Sweep a dot around a circle — one angle driving both axes, which two
 * independent tweens could not do.
 * ```typescript
 * yield* dot.pipe(
 * 	Motion.drive("2 seconds", "linear", (t, data) => ({
 * 		...data,
 * 		position: Entity.vec3({
 * 			x: 250 + Math.cos(t * 2 * Math.PI) * 120,
 * 			y: 150 + Math.sin(t * 2 * Math.PI) * 120,
 * 		}),
 * 	})),
 * );
 * ```
 */
export const drive = dual<
	<Tag extends Entity.EntityTag>(
		duration: Duration.Input,
		timing: Timing.TimingInput,
		fn: (t: number, data: Entity.EntityByTag<Tag>) => Entity.EntityByTag<Tag>,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Entity.EntityTag, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		duration: Duration.Input,
		timing: Timing.TimingInput,
		fn: (t: number, data: Entity.EntityByTag<Tag>) => Entity.EntityByTag<Tag>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(
	firstArgIsInstance,
	Effect.fnUntraced(function* (instanceOrEffect, duration, timing, fn) {
		const instance = yield* Instance.flattenInstance(instanceOrEffect);
		const runner = yield* Runner.Runner;
		const timingFn = Timing.resolve(timing);
		const frames = Math.max(
			1,
			Time.toFrames(duration, runner.settings.frameRate),
		);
		for (let i = 1; i <= frames; i++) {
			const t = timingFn(i / frames);
			yield* Scene.update(instance, (data) => fn(t, data));
			yield* Scene.tick;
		}
		return instance;
	}),
);

/**
 * Like {@link tweenTo}, but with an explicit starting value.
 *
 * @remarks
 * Reach for this when the animation should not begin where the entity
 * currently sits — a "flash in from nothing" that must start at 0 no matter
 * what the last animation left behind, or a field with no current value at
 * all (an optional one never set), which {@link tweenTo} rejects as a
 * defect.
 *
 * Keys present in `to` but missing from `from` still start at the current
 * data, so a partial origin is a targeted override rather than an
 * all-or-nothing switch.
 *
 * @param from - Starting values; keys omitted here start at the current data.
 * @param to - Target values — this key set defines what gets animated.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @defaultValue `timing` — `"linear"`
 * @returns The instance, so animators chain.
 *
 * @example
 * Pop a label in from zero size, regardless of its current `fontSize`.
 * ```typescript
 * yield* label.pipe(
 * 	Motion.tween({ fontSize: 0 }, { fontSize: 32 }, "400 millis", "easeOutBack"),
 * );
 * ```
 */
export const tween = dual<
	<Tag extends Entity.EntityTag>(
		from: Target<Tag>,
		to: Target<Tag>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Entity.EntityTag, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		from: Target<Tag>,
		to: Target<Tag>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animate(instance, from, to, duration, timing),
);

// ── semantic layer ─────────────────────────────────────────────────────
// The lens is gone. Every entity's position IS `data.position`, so what was
// `traitOrDie(entity, "~position")` + get/set collapses into the two
// functions below — a constant path, with nothing per-entity to dispatch on.
// This is what "traits were unnecessary" means in code (design D2/D3).

/** a 3D position as the semantic animators speak it */
export type Position = {
	readonly x: number;
	readonly y: number;
	readonly z: number;
};

/** tags whose entity carries a position: every one of them */
type Positionable = Entity.TagsWith<"position">;
/** tags whose entity carries opacity: every paintable one (not Camera) */
type Fadeable = Entity.TagsWith<"opacity">;

const readPosition = (data: { position: Entity.Vec3 }): Position =>
	data.position;

/**
 * Structural parameter, not `EntityByTag<Tag>`: `Tag extends Fadeable`
 * guarantees the field, but TypeScript will not distribute that constraint
 * over the union, so asking for the shape directly is both true and simpler
 * than an intersection type that never resolves.
 */
const readOpacity = (data: { opacity: number }): number => data.opacity;

/**
 * Write a position, holding unnamed channels at their current value — the
 * channel-level sparseness rule (design D8) that has to survive `position`
 * becoming a nested Vec3. A partial Vec3 must never reach `interpolate`:
 * lerping an absent channel yields NaN frames.
 */
const writePosition = <T extends { position: Entity.Vec3 }>(
	data: T,
	value: Partial<Position>,
): T => ({
	...data,
	position: Entity.vec3({
		x: value.x ?? data.position.x,
		y: value.y ?? data.position.y,
		z: value.z ?? data.position.z,
	}),
});

const animatePosition = Effect.fnUntraced(function* <
	Tag extends Positionable,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Tag, E, R>,
	from: Partial<Position> | undefined,
	to: Partial<Position>,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flattenInstance(instanceOrEffect);
	const current = readPosition(yield* Scene.data(instance));
	// partial targets/origins hold the missing axis at its current value
	const target = { ...current, ...to };
	const start = { ...current, ...(from ?? {}) };
	yield* interpolate(
		start,
		target,
		duration,
		(value) => Scene.update(instance, (data) => writePosition(data, value)),
		timing,
	);
	return instance;
});

const animateOpacity = Effect.fnUntraced(function* <
	Tag extends Fadeable,
	E = never,
	R = never,
>(
	instanceOrEffect: Instance.InstanceOrEffect<Tag, E, R>,
	from: number | undefined,
	to: number,
	duration: Duration.Input,
	timing?: Timing.TimingInput,
) {
	const instance = yield* Instance.flattenInstance(instanceOrEffect);
	const current = readOpacity(yield* Scene.data(instance));
	yield* interpolate(
		{ opacity: from ?? current },
		{ opacity: to },
		duration,
		(value) =>
			Scene.update(instance, (data) => ({ ...data, opacity: value.opacity })),
		timing,
	);
	return instance;
});

/**
 * Move an instance to a position over `duration`.
 *
 * @remarks
 * The semantic counterpart to tweening x/y/z by hand, and what you should
 * reach for whenever you want something to travel. Because every entity's
 * geometry is expressed RELATIVE to its `position`, one `moveTo` translates
 * the whole shape rigidly: a Line carries both endpoints, a Path its whole
 * command list, a Group its entire subtree. There is no per-entity special
 * casing to remember.
 *
 * Targets are partial — naming only `x` holds `y` and `z` at their current
 * values, which is what makes single-axis motion read cleanly. `z` is depth:
 * moving along it changes an entity's size and parallax under a perspective
 * camera rather than just its sort order.
 *
 * Accepted for any entity that carries a position, which is all of them —
 * the Camera included, so this is also how you fly the camera.
 *
 * @param to - Target position; omitted axes hold their current value.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @defaultValue `timing` — `"linear"`
 * @returns The instance, so animators chain.
 * @see {@link move} to start from an explicit position, and
 *   `Physics.springTo` for durationless motion with momentum.
 *
 * @example
 * Slide right, then drop — the second leg holds the x reached by the first.
 * ```typescript
 * yield* box.pipe(
 * 	Motion.moveTo({ x: 400 }, "1 second", "easeInOutCubic"),
 * 	Motion.moveTo({ y: 250 }, "600 millis", "easeInQuad"),
 * );
 * ```
 */
export const moveTo = dual<
	<Tag extends Positionable>(
		to: Partial<Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Positionable, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		to: Partial<Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animatePosition(instance, undefined, to, duration, timing),
);

/**
 * Like {@link moveTo}, but starting from an explicit position.
 *
 * @remarks
 * The entrance animator: an instance can sit at its final position in the
 * scene tree and still fly in from off-screen, because the origin is stated
 * rather than read. Both `from` and `to` are partial, and each fills its
 * missing axes from the current position.
 *
 * @param from - Starting position; omitted axes start at the current value.
 * @param to - Target position; omitted axes hold their current value.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @defaultValue `timing` — `"linear"`
 * @returns The instance, so animators chain.
 *
 * @example
 * Slide a title in from off the left edge to where it was declared.
 * ```typescript
 * yield* title.pipe(
 * 	Motion.move({ x: -200 }, { x: 60 }, "700 millis", "easeOutCubic"),
 * );
 * ```
 */
export const move = dual<
	<Tag extends Positionable>(
		from: Partial<Position>,
		to: Partial<Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Positionable, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		from: Partial<Position>,
		to: Partial<Position>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animatePosition(instance, from, to, duration, timing),
);

/**
 * Fade an instance's `opacity` to `to` over `duration`.
 *
 * @remarks
 * Opacity runs 0 (invisible) to 1 (fully opaque), and applies to the whole
 * subtree: fading a Group fades everything inside it, which is the usual way
 * to dissolve a composed element as one piece.
 *
 * Only entities that actually paint carry `opacity`, so this is statically
 * gated — fading a Camera is a compile error naming the missing field, not a
 * runtime surprise.
 *
 * @param to - Target opacity, 0 to 1.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @defaultValue `timing` — `"linear"`
 * @returns The instance, so animators chain.
 * @see {@link fade} to start from an explicit opacity.
 *
 * @example
 * Land, hold, then dissolve out.
 * ```typescript
 * yield* card.pipe(
 * 	Motion.moveTo({ y: 100 }, "500 millis"),
 * 	Motion.wait("1 second"),
 * 	Motion.fadeTo(0, "400 millis"),
 * );
 * ```
 */
export const fadeTo = dual<
	<Tag extends Fadeable>(
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Fadeable, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	animateOpacity(instance, undefined, to, duration, timing),
);

/**
 * Like {@link fadeTo}, but starting from an explicit opacity.
 *
 * @remarks
 * The fade-in idiom: entities are born fully opaque, so `fadeTo(1)` alone
 * would be a no-op. Stating the origin is what makes an entrance possible
 * without first writing `opacity: 0` at instantiate time.
 *
 * @param from - Starting opacity, 0 to 1.
 * @param to - Target opacity, 0 to 1.
 * @param duration - How long, in scene time.
 * @param timing - An easing name or function.
 * @defaultValue `timing` — `"linear"`
 * @returns The instance, so animators chain.
 *
 * @example
 * Fade a caption in from nothing.
 * ```typescript
 * yield* caption.pipe(Motion.fade(0, 1, "500 millis"));
 * ```
 */
export const fade = dual<
	<Tag extends Fadeable>(
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>,
	<Tag extends Fadeable, E = never, R = never>(
		instance: Instance.InstanceOrEffect<Tag, E, R>,
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<Tag>, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	animateOpacity(instance, from, to, duration, timing),
);

/**
 * The dual nature of {@link wait}: an Effect you can yield, and a function
 * you can drop into a `pipe` chain.
 *
 * @remarks
 * Being callable is what lets a hold sit BETWEEN two animators in the same
 * chain — it wraps the preceding step, waits after it completes, and passes
 * that step's value (the instance) through untouched, so the chain keeps
 * flowing.
 */
export interface Wait extends Effect.Effect<void, never, Runner.Runner> {
	<A, E, R>(
		effect: Effect.Effect<A, E, R>,
	): Effect.Effect<A, E, R | Runner.Runner>;
}

/**
 * Hold for `duration` of scene time — the chainable sibling of
 * `Scene.sleep`.
 *
 * @remarks
 * This is frame time, not wall time: `Effect.sleep` would block on a real
 * clock and make the scene non-deterministic, so `wait` advances whole
 * frames at the runner's frame rate instead. The same hold produces the
 * same frame count on every run and on every machine.
 *
 * Its value over `Scene.sleep` is placement — because it doubles as a pipe
 * step, a beat can sit inside an animator chain without breaking it apart
 * into separate statements.
 *
 * As a pipe step it wraps the PRECEDING step, so it needs one to wrap:
 * place it after at least one animator, not as the opening step of a chain.
 * To hold before anything animates, yield `Motion.wait` (or `Scene.sleep`)
 * on its own line first.
 *
 * @param duration - How long to hold, in scene time.
 *
 * @example
 * A hold between two animations, mid-chain — `card` flows through to the
 * fade.
 * ```typescript
 * yield* card.pipe(
 * 	Motion.moveTo({ y: 100 }, "500 millis"),
 * 	Motion.wait("1 second"),
 * 	Motion.fadeTo(0, "300 millis"),
 * );
 * ```
 *
 * @example
 * Or yielded on its own, as a plain pause in the scene body.
 * ```typescript
 * yield* Motion.wait("2 seconds");
 * ```
 */
export const wait = (duration: Duration.Input): Wait =>
	Object.assign(
		<A, E, R>(
			effect: Effect.Effect<A, E, R>,
		): Effect.Effect<A, E, R | Runner.Runner> =>
			Effect.tap(effect, () => Scene.sleep(duration)),
		Effectable.Prototype<Effect.Effect<void, never, Runner.Runner>>({
			label: "Motion.wait",
			evaluate: () => Scene.sleep(duration),
		}),
	) as Wait;
