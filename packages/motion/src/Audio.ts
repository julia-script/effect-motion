/**
 * Audio: the resource, its prepared metadata, the transport, and gain
 * animators.
 *
 * @remarks
 * Three layers, each opt-in:
 *
 * - **Reference** — {@link Audio} declares a track. Yielding it adds a
 *   phantom `AudioLoader<ID>`; like fonts and images, frames never read the
 *   bytes, so `Scene.run`/`stream` need no loader.
 * - **Inspection** — {@link duration} reads PREPARED metadata. Its
 *   requirement (`AudioMetadata<ID>`) is deliberately not a loader, so it
 *   survives into `Scene.run`/`stream`: a scene that asks for a duration
 *   cannot run until one is provided ({@link metadataLayer},
 *   {@link preparedLayer}).
 * - **Transport and gain** — {@link play}, {@link pause}, {@link resume},
 *   {@link seek}, {@link stop} drive the `Audio` entity's `playing`/`time`;
 *   {@link fade}/{@link fadeTo} and the endpoint sugar animate `gain`.
 *
 * The engine never plays, decodes, or mixes: players and exporters read the
 * `Audio` entries of each frame (see the add-audio design for the contract).
 *
 * @example
 * ```typescript
 * const Theme = Audio.Audio("theme");
 *
 * const scene = Scene.make(function* () {
 * 	const theme = yield* Theme;
 * 	const track = yield* Audio.play(theme, { gain: 0 });
 * 	yield* track.pipe(Audio.fadeIn("1 second"));
 * 	yield* Scene.sleep(yield* Audio.duration(Theme));
 * });
 * ```
 */
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import { dual } from "effect/Function";
import * as Layer from "effect/Layer";
import * as Entity from "./Entity.js";
import * as Instance from "./Instance.js";
import * as Motion from "./Motion.js";
import * as Resource from "./Resource.js";
import * as Runner from "./Runner.js";
import * as Scene from "./Scene.js";
import * as Time from "./Time.js";
import type * as Timing from "./Timing.js";
import type { EnsureLiteral } from "./types.js";

export const tag = "effect-motion/Resources/Audio" as const;

/**
 * An audio reference as entity data stores it: `{ _tag, id }`. Obtain one
 * by yielding an {@link Audio} constant inside a scene.
 */
export interface Audio<ID extends string = string> {
	readonly _tag: typeof tag;
	readonly id: ID;
}

/** The stored-data schema for audio references (the entity's `audio`). */
export const schema = Entity.Audio.fields.audio;

const loaderKeyPrefix = "effect-motion/Resources/AudioLoader/" as const;
const metadataKeyPrefix = "effect-motion/Resources/AudioMetadata/" as const;

/**
 * A loaded audio file (encoded bytes), provided as a context service and
 * loaded eagerly at layer construction. Carries the loader brand, so frame
 * production never needs it — only players and exporters do.
 */
export interface AudioLoader<ID extends string = string>
	extends Resource.LoaderBrand {
	readonly id: ID;
	readonly bytes: Uint8Array;
}

/**
 * Prepared, immutable facts about a track that a scene may explicitly
 * inspect. NOT loader-branded: `Scene.run`/`stream` keep it as a real
 * requirement, so a scene that reads it cannot run without it.
 */
export interface AudioMetadata<ID extends string = string> {
	readonly id: ID;
	/** source length in seconds (finite, ≥ 0) */
	readonly duration: number;
}

/** What a metadata provider supplies; the id comes from the track. */
export interface MetadataInput {
	readonly duration: number;
}

/** The context key for a track's loader, derived from the id string alone. */
export const Loader = <ID extends string>(
	id: ID,
): Context.Service<AudioLoader<ID>, AudioLoader<ID>> =>
	Context.Service<AudioLoader<ID>>(`${loaderKeyPrefix}${id}`);

/** The context key for a track's prepared metadata, derived from the id. */
export const Metadata = <ID extends string>(
	id: ID,
): Context.Service<AudioMetadata<ID>, AudioMetadata<ID>> =>
	Context.Service<AudioMetadata<ID>>(`${metadataKeyPrefix}${id}`);

/**
 * One audio constant, two faces — author side (`yield*` for the reference
 * and the phantom `AudioLoader<ID>`) and provider side (`.Loader`,
 * `.Metadata`, plus {@link layer} / {@link metadataLayer}).
 */
export interface AudioResource<ID extends string = string>
	extends Effect.Effect<Audio<ID>, never, AudioLoader<ID>> {
	readonly id: ID;
	readonly Loader: Context.Service<AudioLoader<ID>, AudioLoader<ID>>;
	readonly Metadata: Context.Service<AudioMetadata<ID>, AudioMetadata<ID>>;
}

/**
 * Declare an audio track your scene uses.
 *
 * @remarks
 * The `Font.Font` / `Image.Image` contract: `yield*` the constant in a scene
 * to get the reference for {@link play}, and pair it with {@link layer} to
 * provide the bytes. Declaring or playing a track never needs its bytes to
 * produce frames; only {@link duration} adds a real requirement.
 *
 * @param id - An identifier for this track, as a literal string.
 */
export const Audio = <const ID extends string>(
	id: ID & EnsureLiteral<ID, "Audio id must be a literal string">,
): AudioResource<ID> => {
	const value: Audio<ID> = { _tag: tag, id };
	return Object.assign(Effect.succeed(value), {
		id: id as ID,
		Loader: Loader(id as ID),
		Metadata: Metadata(id as ID),
	});
};

const loaderOf = <ID extends string>(
	id: ID,
	bytes: Uint8Array,
): AudioLoader<ID> => ({
	[Resource.LoaderTypeId]: Resource.LoaderTypeId,
	id,
	bytes,
});

/**
 * Provide a track's encoded bytes. The load effect runs ONCE, at layer
 * construction — never at frame time.
 */
export const layer = <ID extends string, E, R>(
	track: AudioResource<ID>,
	load: Effect.Effect<Uint8Array, E, R>,
): Layer.Layer<AudioLoader<ID>, E, R> =>
	Layer.effect(
		track.Loader,
		Effect.map(load, (bytes) => loaderOf(track.id, bytes)),
	);

// prepared data is external input: reject what would make frame counts NaN
const validMetadata = <ID extends string>(
	id: ID,
	input: MetadataInput,
): Effect.Effect<AudioMetadata<ID>> =>
	Number.isFinite(input.duration) && input.duration >= 0
		? Effect.succeed({ id, duration: input.duration })
		: Effect.die(
				new Error(
					`Audio "${id}": metadata duration must be a finite number ≥ 0, got ${input.duration}`,
				),
			);

/**
 * Provide already-prepared metadata for a track. An invalid duration dies
 * at layer construction, naming the track.
 */
export const metadataLayer = <ID extends string>(
	track: AudioResource<ID>,
	metadata: MetadataInput,
): Layer.Layer<AudioMetadata<ID>> =>
	Layer.effect(track.Metadata, validMetadata(track.id, metadata));

/**
 * Provide a track's bytes AND metadata derived from those same bytes.
 *
 * @remarks
 * `load` runs once; `inspect` (the adapter's decoder or probe) receives
 * exactly the bytes the loader provides, so duration can never describe a
 * different file than the one that plays.
 */
export const preparedLayer = <ID extends string, E, R, E2, R2>(
	track: AudioResource<ID>,
	load: Effect.Effect<Uint8Array, E, R>,
	inspect: (bytes: Uint8Array) => Effect.Effect<MetadataInput, E2, R2>,
): Layer.Layer<AudioLoader<ID> | AudioMetadata<ID>, E | E2, R | R2> =>
	Layer.effectContext(
		Effect.gen(function* () {
			const bytes = yield* load;
			const metadata = yield* Effect.flatMap(inspect(bytes), (input) =>
				validMetadata(track.id, input),
			);
			return Context.make(track.Loader, loaderOf(track.id, bytes)).pipe(
				Context.add(track.Metadata, metadata),
			);
		}),
	);

/**
 * The track's full source length — an explicit inspection.
 *
 * @remarks
 * Requires `AudioMetadata<ID>`, which survives `Scene.run`/`stream`: run the
 * scene with {@link metadataLayer} or {@link preparedLayer} provided. The
 * result is a `Duration`, so it feeds `Scene.sleep` and the `duration`
 * option of {@link play} directly. For the remaining length of a play
 * started at `from` seconds, subtract `Duration.seconds(from)`.
 */
export const duration = <ID extends string>(
	track: Audio<ID> | AudioResource<ID>,
): Effect.Effect<Duration.Duration, never, AudioMetadata<ID>> =>
	Metadata(track.id).useSync((metadata) => Duration.seconds(metadata.duration));

// ── transport ───────────────────────────────────────────────────────────
// `playing` and `time` are transport-owned: while playing, the Runner
// derives `time` from an anchor (frame, time) — exact on every frame, no
// drift, no fiber. Each op writes on the frame it runs and restarts the
// anchor there, dropping any clip end, so fiber order within a frame is
// moot and a later explicit command always wins over an earlier clip.

/** The transport part of an Audio entity's data. */
export interface Transport {
	readonly playing: boolean;
	readonly time: number;
}

const transport = Effect.fnUntraced(function* <E, R>(
	instanceOrEffect: Instance.InstanceOrEffect<"Audio", E, R>,
	next: (current: Transport) => Transport,
) {
	const instance = yield* Instance.flattenInstance(instanceOrEffect);
	const runner = yield* Runner.Runner;
	// the live cursor: reads resolve a playing track to this frame
	const data = yield* Scene.data(instance);
	const result = next(data);
	runner.setDataUnsafe(instance, { ...data, ...result });
	runner.anchorAudio(instance.id);
	return instance;
});

/** Options for {@link play}. */
export interface PlayOptions {
	/** source position to start at, in seconds (default 0) */
	readonly from?: number;
	/** linear gain (default 1) */
	readonly gain?: number;
	/** wrap at the source end instead of falling silent (default false) */
	readonly loop?: boolean;
	/**
	 * Play a clip this long (scene time): the track pauses on the frame the
	 * clip ends, wherever the play ran. Omitted: the play runs until paused,
	 * stopped, or the scene ends.
	 */
	readonly duration?: Duration.Input;
}

/**
 * Start a track: create a playing `Audio` instance and return it at once.
 *
 * @remarks
 * The cursor advances exactly one frame period per frame from `from`, and
 * playing alone never holds the scene open.
 *
 * With `duration` the play is a clip: the track pauses exactly on the frame
 * `duration` elapses — decided by the Runner, so it holds even when the
 * play ran inside a `Scene.all` branch or a fork that has since ended. The
 * clip also holds the scene open for `duration` the way a `Scene.fork`
 * started here would: from the scene body (or any branch alive that long)
 * the scene cannot end first; a fork owned by a shorter-lived branch is cut
 * with that branch (Scene.fork ownership), and then the rest of the scene
 * decides the length. A zero duration pauses on the same frame.
 *
 * Any later explicit {@link pause}, {@link resume}, {@link seek} or
 * {@link stop} cancels the clip end: user-directed playback after it is
 * never cut by the earlier clip. The hold is scene time and unaffected.
 *
 * Control the returned instance with those operations and the gain
 * animators.
 *
 * @param track - A reference from yielding an {@link Audio} constant.
 * @param options - `from`, `gain`, `loop`, `duration`.
 * @returns The Audio instance.
 */
export const play = Effect.fnUntraced(function* <ID extends string>(
	track: Audio<ID>,
	options: PlayOptions = {},
): Effect.fn.Return<Instance.Instance<"Audio">, never, Runner.Runner> {
	const instance = yield* Scene.instantiate("Audio", {
		audio: track,
		time: options.from ?? 0,
		gain: options.gain ?? 1,
		loop: options.loop ?? false,
	});
	yield* resume(instance);
	const clip = options.duration;
	if (clip !== undefined) {
		const runner = yield* Runner.Runner;
		const frames = Time.toFrames(clip, runner.settings.frameRate);
		runner.anchorAudio(
			instance.id,
			runner.phaser.snapshotUnsafe().phase + frames,
		);
		yield* Scene.fork(Scene.sleep(clip));
	}
	return instance;
});

/** Freeze the cursor where it is; visible on this frame. */
export const pause = <E = never, R = never>(
	instance: Instance.InstanceOrEffect<"Audio", E, R>,
): Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner> =>
	transport(instance, ({ time }) => ({ playing: false, time }));

/**
 * Continue from the current `time` (also starts an instance created with
 * `Scene.instantiate`).
 */
export const resume = <E = never, R = never>(
	instance: Instance.InstanceOrEffect<"Audio", E, R>,
): Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner> =>
	transport(instance, ({ time }) => ({ playing: true, time }));

/** Pause and rewind to the source start (`time: 0`). */
export const stop = <E = never, R = never>(
	instance: Instance.InstanceOrEffect<"Audio", E, R>,
): Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner> =>
	transport(instance, () => ({ playing: false, time: 0 }));

/**
 * Jump the cursor to `time` (source seconds), keeping the play/pause state;
 * visible on this frame.
 */
export const seek = dual<
	(
		time: number,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>,
	<E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
		time: number,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>
>(
	(args) => Instance.isInstance(args[0]),
	(instance, time) => transport(instance, ({ playing }) => ({ playing, time })),
);

/**
 * How far (seconds) a cursor may drift from its expected value and still
 * count as continuous — far below one sample, far above float noise.
 */
export const cursorTolerance = 1e-6;

/**
 * Whether a track's transport continued smoothly between two observed
 * frames `elapsedFrames` apart — the adapters' resync test.
 *
 * @remarks
 * Continuous means the same `playing` state and a `time` within
 * {@link cursorTolerance} of `previous.time + elapsedFrames / frameRate`
 * (paused: unchanged). Anything else — a seek, pause, resume, stop, or a
 * direct write — is a discontinuity to resync to. Skipped frames (player
 * catch-up, sparse export sampling) stay continuous because the expected
 * cursor accounts for every elapsed frame.
 */
export const isContinuous = (
	previous: Transport,
	next: Transport,
	elapsedFrames: number,
	frameRate: number,
): boolean =>
	previous.playing === next.playing &&
	Math.abs(
		next.time -
			(previous.time + (next.playing ? elapsedFrames / frameRate : 0)),
	) <= cursorTolerance;

// ── gain ────────────────────────────────────────────────────────────────

const firstArgIsInstance = (args: IArguments) => Instance.isInstance(args[0]);

/**
 * Animate `gain` to `to` from its current value — `Motion.tweenTo` on
 * `gain`, exact on the final frame.
 */
export const fadeTo = dual<
	(
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>,
	<E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, to, duration, timing) =>
	Motion.tweenTo(instance, { gain: to }, duration, timing),
);

/** Like {@link fadeTo}, from an explicit starting gain. */
export const fade = dual<
	(
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>,
	<E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
		from: number,
		to: number,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, from, to, duration, timing) =>
	Motion.tween(instance, { gain: from }, { gain: to }, duration, timing),
);

/**
 * Fade gain 0 → 1. Names its endpoints, so no base/To pair (recorded
 * exception); use {@link fade} for other levels.
 */
export const fadeIn = dual<
	(
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>,
	<E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, duration, timing) =>
	fade(instance, 0, 1, duration, timing),
);

/**
 * Fade gain from its current value to 0. Gain only — the track keeps
 * playing (pause or stop it afterwards if needed).
 */
export const fadeOut = dual<
	(
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => <E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>,
	<E = never, R = never>(
		instance: Instance.InstanceOrEffect<"Audio", E, R>,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<"Audio">, E, R | Runner.Runner>
>(firstArgIsInstance, (instance, duration, timing) =>
	fadeTo(instance, 0, duration, timing),
);

/**
 * Fade `from` out while `to` fades in (0 → 1), together; resolves with
 * `to`. Two instance operands, so the dual dispatches on the SECOND
 * argument: `crossfade(a, b, d)` or `a.pipe(crossfade(b, d))`.
 */
export const crossfade = dual<
	(
		to: Instance.Instance<"Audio">,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => (
		from: Instance.Instance<"Audio">,
	) => Effect.Effect<Instance.Instance<"Audio">, never, Runner.Runner>,
	(
		from: Instance.Instance<"Audio">,
		to: Instance.Instance<"Audio">,
		duration: Duration.Input,
		timing?: Timing.TimingInput,
	) => Effect.Effect<Instance.Instance<"Audio">, never, Runner.Runner>
>(
	(args) => Instance.isInstance(args[1]),
	(from, to, duration, timing) =>
		Scene.all([
			fadeOut(from, duration, timing),
			fadeIn(to, duration, timing),
		]).pipe(Effect.as(to)),
);
