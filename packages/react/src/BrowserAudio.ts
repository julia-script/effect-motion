import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as Audio from "effect-motion/Audio";
import { EffectMotionError } from "effect-motion/EffectMotionError";
import * as Resource from "effect-motion/Resource";
import type * as Scene from "effect-motion/Scene";

const decodedTag = (id: string) =>
	Context.Service<AudioBuffer>(`@effect-motion/react/BrowserAudio/${id}`);

const makeContext = (): Effect.Effect<AudioContext, EffectMotionError> =>
	Effect.try({
		try: () => new AudioContext(),
		catch: (cause) =>
			EffectMotionError.of("Browser audio is unavailable", cause),
	});

export interface ContextRef {
	current: AudioContext | null;
}

/** Run directly in a play-button event, before any async runtime build. */
export const unlockContext = (ref: ContextRef) =>
	Effect.gen(function* () {
		ref.current ??= yield* makeContext();
		const context = ref.current;
		if (context.state !== "running") {
			yield* Effect.tryPromise({
				try: () => context.resume(),
				catch: (cause) =>
					EffectMotionError.of("Could not resume browser audio", cause),
			});
		}
		if (context.state !== "running") {
			return yield* Effect.fail(
				EffectMotionError.of("Browser blocked audio playback"),
			);
		}
	});

const decode = (
	context: AudioContext,
	id: string,
	bytes: Uint8Array,
): Effect.Effect<AudioBuffer, EffectMotionError> =>
	Effect.tryPromise({
		try: () => context.decodeAudioData(bytes.slice().buffer),
		catch: (cause) =>
			EffectMotionError.of(`Could not decode audio "${id}"`, cause),
	});

/**
 * Prepare a browser track before a duration-driven scene starts. The same
 * decoded buffer is used by the Player, and the duration describes those
 * exact bytes. Each Player mount builds this layer in its own scope.
 */
export const prepare = <ID extends string, E, R>(
	track: Audio.AudioResource<ID>,
	load: Effect.Effect<Uint8Array, E, R>,
): Layer.Layer<
	Audio.AudioLoader<ID> | Audio.AudioMetadata<ID> | AudioBuffer,
	E | EffectMotionError,
	R
> =>
	Layer.effectContext(
		Effect.gen(function* () {
			const bytes = yield* load;
			const context = yield* makeContext();
			const buffer = yield* decode(context, track.id, bytes).pipe(
				Effect.ensuring(
					Effect.tryPromise({
						try: () => context.close(),
						catch: (cause) =>
							EffectMotionError.of("Could not close audio decoder", cause),
					}).pipe(Effect.orDie),
				),
			);
			if (!Number.isFinite(buffer.duration) || buffer.duration < 0) {
				return yield* Effect.die(
					new Error(`Audio "${track.id}": invalid decoded duration`),
				);
			}
			return Context.make(track.Loader, {
				[Resource.LoaderTypeId]: Resource.LoaderTypeId,
				id: track.id,
				bytes,
			}).pipe(
				Context.add(track.Metadata, {
					id: track.id,
					duration: buffer.duration,
				}),
				Context.add(decodedTag(track.id), buffer),
			);
		}),
	);

interface PlayingSource {
	readonly node: AudioBufferSourceNode;
	readonly gain: GainNode;
	readonly data: Audio.Transport & {
		readonly gain: number;
		readonly loop: boolean;
	};
	readonly frame: number;
	readonly startedAt: number;
	readonly offset: number;
	readonly duration: number;
}

export interface BrowserAudio {
	readonly context: AudioContext | null;
	readonly decoded: Map<string, AudioBuffer>;
	readonly sources: Map<string, PlayingSource>;
	unlock: Effect.Effect<void, EffectMotionError>;
	sync(
		frame: Scene.Frame,
		index: number,
		audible: boolean,
	): Effect.Effect<boolean, EffectMotionError>;
	stop: Effect.Effect<void, EffectMotionError>;
}

const stopSource = (
	source: PlayingSource,
): Effect.Effect<void, EffectMotionError> =>
	Effect.try({
		try: () => {
			source.node.stop();
			source.node.disconnect();
			source.gain.disconnect();
		},
		catch: (cause) => EffectMotionError.of("Could not stop audio", cause),
	});

const reachableAudio = (frame: Scene.Frame) => {
	const found: Array<
		[
			string,
			Extract<Scene.Frame["instances"][string]["data"], { _tag: "Audio" }>,
		]
	> = [];
	const seen = new Set<string>();
	const visit = (id: string) => {
		if (seen.has(id)) return;
		seen.add(id);
		const data = frame.instances[id]?.data;
		if (data === undefined) return;
		if (data._tag === "Audio") found.push([id, data]);
		if ("children" in data) for (const child of data.children) visit(child);
	};
	visit(frame.root);
	return found;
};

/** A per-mount source manager. AudioContext is created/resumed by unlock. */
export const make = Effect.fnUntraced(function* (
	contextRef: ContextRef,
): Effect.fn.Return<BrowserAudio, never, Scope.Scope> {
	let context: AudioContext | null = contextRef.current;
	const decoded = new Map<string, AudioBuffer>();
	const sources = new Map<string, PlayingSource>();
	const stop = Effect.gen(function* () {
		for (const source of sources.values()) yield* stopSource(source);
		sources.clear();
	});
	const unlock = Effect.gen(function* () {
		yield* unlockContext(contextRef);
		context = contextRef.current;
	});
	yield* Effect.addFinalizer(() =>
		stop.pipe(
			Effect.andThen(
				Effect.suspend(() => {
					const audioContext = context;
					return audioContext === null
						? Effect.void
						: Effect.tryPromise({
								try: () => audioContext.close(),
								catch: (cause) =>
									EffectMotionError.of("Could not close browser audio", cause),
							}).pipe(Effect.orDie);
				}),
			),
			Effect.tap(() => Effect.sync(() => decoded.clear())),
			Effect.orDie,
		),
	);
	const sync = Effect.fnUntraced(function* (
		frame: Scene.Frame,
		index: number,
		audible: boolean,
	) {
		const tracks = reachableAudio(frame);
		if (!audible) {
			yield* stop;
			return false;
		}
		if (context === null || context.state !== "running") {
			return tracks.some(([, data]) => data.playing);
		}
		const audioContext = context;
		const live = new Set<string>();
		const services = yield* Effect.context<never>();
		for (const [id, data] of tracks) {
			if (!data.playing) continue;
			const asset = data.audio.id;
			let buffer = decoded.get(asset);
			if (buffer === undefined) {
				const prepared = Context.getOption(services, decodedTag(asset));
				if (Option.isSome(prepared)) {
					buffer = prepared.value;
				} else {
					const loader = Context.getOption(services, Audio.Loader(asset));
					if (Option.isNone(loader)) {
						return yield* Effect.die(
							new Error(`No audio loader provided for "${asset}"`),
						);
					}
					buffer = yield* decode(context, asset, loader.value.bytes);
				}
				decoded.set(asset, buffer);
			}
			const duration = buffer.duration;
			const position =
				data.loop && duration > 0
					? ((data.time % duration) + duration) % duration
					: data.time;
			if (
				duration <= 0 ||
				(!data.loop && (position < 0 || position >= duration))
			)
				continue;
			live.add(id);
			let current = sources.get(id);
			if (current !== undefined) {
				const elapsed = index - current.frame;
				const continuous =
					elapsed > 0
						? Audio.isContinuous(current.data, data, elapsed, frame.frameRate)
						: elapsed === 0 && current.data.time === data.time;
				const actual =
					current.offset + (audioContext.currentTime - current.startedAt);
				const drift =
					data.loop && duration > 0
						? Math.abs(
								((((position - actual) % duration) + duration * 1.5) %
									duration) -
									duration / 2,
							)
						: Math.abs(position - actual);
				if (!continuous || drift > 0.05 || current.data.loop !== data.loop) {
					yield* stopSource(current);
					sources.delete(id);
					current = undefined;
				}
			}
			if (current === undefined) {
				const { node, gain } = yield* Effect.try({
					try: () => {
						const node = audioContext.createBufferSource();
						const gain = audioContext.createGain();
						node.buffer = buffer;
						node.loop = data.loop;
						gain.gain.setValueAtTime(
							Math.max(0, data.gain),
							audioContext.currentTime,
						);
						node.connect(gain);
						gain.connect(audioContext.destination);
						node.start(0, position);
						return { node, gain };
					},
					catch: (cause) =>
						EffectMotionError.of(`Could not start audio "${asset}"`, cause),
				});
				current = {
					node,
					gain,
					data,
					frame: index,
					startedAt: audioContext.currentTime,
					offset: position,
					duration,
				};
				sources.set(id, current);
			} else {
				const active = current;
				yield* Effect.try({
					try: () => {
						active.gain.gain.cancelScheduledValues(audioContext.currentTime);
						active.gain.gain.setValueAtTime(
							active.gain.gain.value,
							audioContext.currentTime,
						);
						active.gain.gain.linearRampToValueAtTime(
							Math.max(0, data.gain),
							audioContext.currentTime + 1 / frame.frameRate,
						);
					},
					catch: (cause) =>
						EffectMotionError.of(
							`Could not set audio gain for "${asset}"`,
							cause,
						),
				});
				sources.set(id, { ...current, data, frame: index });
			}
		}
		for (const [id, source] of sources) {
			if (!live.has(id)) {
				yield* stopSource(source);
				sources.delete(id);
			}
		}
		return false;
	});
	return {
		get context() {
			return context;
		},
		decoded,
		sources,
		unlock,
		sync,
		stop,
	};
});
