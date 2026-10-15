import * as Effect from "effect/Effect";
import { type File, FileSystem } from "effect/FileSystem";
import * as Audio from "effect-motion/Audio";
import type * as Scene from "effect-motion/Scene";
import * as Ffmpeg from "./Ffmpeg.js";

/** A frame's reachable audio instances, keyed by instance rather than asset. */
export interface Track {
	readonly instanceId: string;
	readonly assetId: string;
	readonly time: number;
	readonly gain: number;
	readonly loop: boolean;
	readonly playing: boolean;
}

export interface TimelineFrame {
	readonly frame: number;
	readonly tracks: ReadonlyArray<Track>;
}

/** Only mounted descendants can be heard. Paused entries remain in the timeline. */
export const collect = <R>(
	frame: Scene.Frame<R>,
	index: number,
): TimelineFrame => {
	const tracks: Track[] = [];
	const stack = [frame.root];
	const visited = new Set<string>();
	while (stack.length > 0) {
		const id = stack.pop();
		if (id === undefined || visited.has(id)) continue;
		visited.add(id);
		const data = frame.instances[id]?.data;
		if (data === undefined) continue;
		if (data._tag === "Audio") {
			tracks.push({
				instanceId: id,
				assetId: data.audio.id,
				time: data.time,
				gain: data.gain,
				loop: data.loop,
				playing: data.playing,
			});
		}
		if ("children" in data) stack.push(...data.children);
	}
	return { frame: index, tracks };
};

/** Add one track's interleaved stereo samples, with a linear frame gain ramp. */
export const mixSamples = (
	output: Float32Array,
	window: Float32Array,
	fraction: number,
	fromGain: number,
	toGain: number,
): void => {
	const samples = output.length / Ffmpeg.pcm.channels;
	const start = Math.max(0, fromGain);
	const end = Math.max(0, toGain);
	for (let i = 0; i < samples; i++) {
		const gain = start + ((end - start) * (i + 1)) / samples;
		for (let channel = 0; channel < Ffmpeg.pcm.channels; channel++) {
			const offset = i * Ffmpeg.pcm.channels + channel;
			const a = window[offset] ?? 0;
			const b = window[offset + Ffmpeg.pcm.channels] ?? 0;
			output[offset] = (output[offset] ?? 0) + (a + (b - a) * fraction) * gain;
		}
	}
};

interface Source {
	readonly file: File;
	readonly samples: number;
}

const ioError = (message: string, cause: unknown) =>
	new Ffmpeg.EncodeError({ message, stderr: "", cause });

const sourceWindow = Effect.fnUntraced(function* (
	source: Source,
	start: number,
	count: number,
	loop: boolean,
) {
	const bytes = new Uint8Array(count * Ffmpeg.pcm.bytesPerSampleFrame);
	let written = 0;
	while (written < count && source.samples > 0) {
		const absolute = start + written;
		const position = loop
			? ((absolute % source.samples) + source.samples) % source.samples
			: absolute;
		if (position < 0 || position >= source.samples) break;
		const span = Math.min(count - written, source.samples - position);
		yield* source.file.seek(
			BigInt(position * Ffmpeg.pcm.bytesPerSampleFrame),
			"start",
		);
		const segment = bytes.subarray(
			written * Ffmpeg.pcm.bytesPerSampleFrame,
			(written + span) * Ffmpeg.pcm.bytesPerSampleFrame,
		);
		let read = 0;
		while (read < segment.length) {
			const n = yield* source.file.read(segment.subarray(read));
			if (n === 0)
				return yield* Effect.fail(ioError("Truncated decoded audio", source));
			read += n;
		}
		written += span;
	}
	const view = new DataView(bytes.buffer);
	const result = new Float32Array(count * Ffmpeg.pcm.channels);
	for (let i = 0; i < result.length; i++) {
		result[i] = view.getFloat32(i * Float32Array.BYTES_PER_ELEMENT, true);
	}
	return result;
});

/** Mix frame spans directly to a PCM file; memory stays bounded to one frame. */
export const write = (
	timeline: ReadonlyArray<TimelineFrame>,
	frameRate: number,
	sourcePaths: ReadonlyMap<string, string>,
	outPath: string,
): Effect.Effect<void, Ffmpeg.EncodeError, FileSystem> =>
	Effect.scoped(
		Effect.gen(function* () {
			const fs = yield* FileSystem;
			const sources = new Map<string, Source>();
			for (const [id, path] of sourcePaths) {
				const file = yield* fs.open(path);
				const info = yield* file.stat;
				sources.set(id, {
					file,
					samples: Math.floor(
						Number(info.size) / Ffmpeg.pcm.bytesPerSampleFrame,
					),
				});
			}
			const out = yield* fs.open(outPath, { flag: "w" });
			let previous = new Map<string, Track>();
			for (const frame of timeline) {
				const firstSample = Math.round(
					(frame.frame * Ffmpeg.pcm.sampleRate) / frameRate,
				);
				const endSample = Math.round(
					((frame.frame + 1) * Ffmpeg.pcm.sampleRate) / frameRate,
				);
				const count = endSample - firstSample;
				const output = new Float32Array(count * Ffmpeg.pcm.channels);
				const next = new Map<string, Track>();
				for (const track of frame.tracks) {
					next.set(track.instanceId, track);
					if (!track.playing || count === 0) continue;
					const source = sources.get(track.assetId);
					if (source === undefined) {
						return yield* Effect.fail(
							ioError(`No decoded audio for "${track.assetId}"`, track),
						);
					}
					// The first sample's time is firstSample / sampleRate, which may
					// differ from the frame boundary by half a sample after rounding.
					const position =
						track.time * Ffmpeg.pcm.sampleRate +
						firstSample -
						(frame.frame * Ffmpeg.pcm.sampleRate) / frameRate;
					const start = Math.floor(position);
					const window = yield* sourceWindow(
						source,
						start,
						count + 1,
						track.loop,
					);
					const prior = previous.get(track.instanceId);
					mixSamples(
						output,
						window,
						position - start,
						prior?.playing &&
							prior.assetId === track.assetId &&
							Audio.isContinuous(prior, track, 1, frameRate)
							? prior.gain
							: track.gain,
						track.gain,
					);
				}
				previous = next;
				const bytes = new Uint8Array(output.byteLength);
				const view = new DataView(bytes.buffer);
				for (let i = 0; i < output.length; i++) {
					view.setFloat32(
						i * Float32Array.BYTES_PER_ELEMENT,
						output[i] ?? 0,
						true,
					);
				}
				yield* out.writeAll(bytes);
			}
		}).pipe(
			Effect.mapError((cause) =>
				cause instanceof Ffmpeg.EncodeError
					? cause
					: ioError("Could not mix decoded audio", cause),
			),
		),
	);
