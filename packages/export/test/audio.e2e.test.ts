import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Audio from "effect-motion/Audio";
import * as Scene from "effect-motion/Scene";
import { afterAll, expect, it } from "vitest";
import * as Ffmpeg from "../src/Ffmpeg";
import * as Video from "../src/Video";

const has = (bin: string) => {
	try {
		execFileSync(bin, ["-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};
const canVerify = has("ffmpeg") && has("ffprobe");
const dir = canVerify
	? mkdtempSync(join(tmpdir(), "effect-motion-audio-e2e-"))
	: "";
afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

const sampleRate = 48_000;
const toneWav = (): Uint8Array => {
	const samples = sampleRate;
	const channels = 2;
	const dataBytes = samples * channels * 2;
	const bytes = new Uint8Array(44 + dataBytes);
	const view = new DataView(bytes.buffer);
	const label = (at: number, value: string) => {
		for (let i = 0; i < value.length; i++)
			view.setUint8(at + i, value.charCodeAt(i));
	};
	label(0, "RIFF");
	view.setUint32(4, 36 + dataBytes, true);
	label(8, "WAVE");
	label(12, "fmt ");
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, channels, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * channels * 2, true);
	view.setUint16(32, channels * 2, true);
	view.setUint16(34, 16, true);
	label(36, "data");
	view.setUint32(40, dataBytes, true);
	for (let i = 0; i < samples; i++) {
		const value =
			i < sampleRate / 5
				? 0
				: Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 20_000);
		for (let channel = 0; channel < channels; channel++) {
			view.setInt16(44 + (i * channels + channel) * 2, value, true);
		}
	}
	return bytes;
};

const Theme = Audio.Audio("theme");
const scene = Scene.make(
	function* () {
		const theme = yield* Theme;
		const track = yield* Audio.play(theme, { from: 0.25 });
		yield* Scene.sleep("300 millis");
		yield* Audio.pause(track);
		yield* Scene.sleep("200 millis");
		yield* Audio.resume(track);
		yield* Audio.fadeTo(track, 0, "300 millis");
		yield* Audio.stop(track);
		yield* Scene.sleep(yield* Audio.duration(Theme));
	},
	{ width: 64, height: 64 },
);

const loopScene = Scene.make(
	function* () {
		const theme = yield* Theme;
		const first = yield* Audio.play(theme, {
			from: 0.8,
			loop: true,
			gain: 0.5,
		});
		const second = yield* Audio.play(theme, {
			from: 0.8,
			loop: true,
			gain: 0.5,
		});
		yield* Scene.sleep("200 millis");
		yield* Audio.pause(second);
		yield* Scene.sleep("400 millis");
		yield* Audio.stop(first);
		yield* Scene.sleep("200 millis");
	},
	{ width: 64, height: 64 },
);

const probe = (path: string) =>
	JSON.parse(
		execFileSync("ffprobe", [
			"-v",
			"error",
			"-show_entries",
			"format=duration:stream=codec_type,duration",
			"-of",
			"json",
			path,
		]).toString(),
	) as {
		streams: Array<{ codec_type: string; duration?: string }>;
		format: { duration: string };
	};

const rms = (audio: Buffer, from: number, to: number): number => {
	const samples = new DataView(
		audio.buffer,
		audio.byteOffset,
		audio.byteLength,
	);
	const first = Math.round(from * sampleRate);
	const end = Math.min(Math.round(to * sampleRate), audio.byteLength / 8);
	let square = 0;
	for (let i = first; i < end; i++) {
		const value = samples.getFloat32(i * 8, true);
		square += value * value;
	}
	return Math.sqrt(square / (end - first));
};

it.runIf(canVerify)(
	"renders AAC with frame-length audio, offset, pause, fade and stop",
	async () => {
		const out = join(dir, "with-audio.mp4");
		await Effect.runPromise(
			Video.render(scene, out, { settings: { frameRate: 10 } }).pipe(
				Effect.provide(Video.prepareAudio(Theme, Effect.succeed(toneWav()))),
				Effect.provide(NodeServices.layer),
			),
		);
		expect(existsSync(out)).toBe(true);
		const info = probe(out);
		expect(info.streams.filter((s) => s.codec_type === "audio")).toHaveLength(
			1,
		);
		expect(info.streams.filter((s) => s.codec_type === "video")).toHaveLength(
			1,
		);
		const videoDuration = Number(
			info.streams.find((s) => s.codec_type === "video")?.duration,
		);
		const audioDuration = Number(
			info.streams.find((s) => s.codec_type === "audio")?.duration,
		);
		expect(Math.abs(audioDuration - videoDuration)).toBeLessThan(0.05);

		const decoded = execFileSync(
			"ffmpeg",
			[
				"-v",
				"error",
				"-i",
				out,
				"-vn",
				"-f",
				"f32le",
				"-ar",
				"48000",
				"-ac",
				"2",
				"pipe:1",
			],
			{ maxBuffer: 20 * 1024 * 1024 },
		);
		expect(rms(decoded, 0.05, 0.15)).toBeGreaterThan(0.15);
		expect(rms(decoded, 0.35, 0.45)).toBeLessThan(0.03);
		expect(rms(decoded, 0.52, 0.59)).toBeGreaterThan(0.07);
		expect(rms(decoded, 0.9, 1.0)).toBeLessThan(0.02);
	},
	30_000,
);

it.runIf(canVerify)(
	"loops at the source end and mixes two instances of the same asset",
	async () => {
		const out = join(dir, "loop-and-instances.mp4");
		await Effect.runPromise(
			Video.render(loopScene, out, { settings: { frameRate: 10 } }).pipe(
				Effect.provide(Audio.layer(Theme, Effect.succeed(toneWav()))),
				Effect.provide(NodeServices.layer),
			),
		);
		const info = probe(out);
		expect(info.streams.filter((s) => s.codec_type === "audio")).toHaveLength(
			1,
		);
		const decoded = execFileSync(
			"ffmpeg",
			[
				"-v",
				"error",
				"-i",
				out,
				"-vn",
				"-f",
				"f32le",
				"-ar",
				"48000",
				"-ac",
				"2",
				"pipe:1",
			],
			{ maxBuffer: 20 * 1024 * 1024 },
		);
		expect(rms(decoded, 0.05, 0.15)).toBeGreaterThan(0.3);
		expect(rms(decoded, 0.25, 0.35)).toBeLessThan(0.03);
		expect(rms(decoded, 0.45, 0.55)).toBeGreaterThan(0.12);
		expect(rms(decoded, 0.65, 0.75)).toBeLessThan(0.02);
	},
	30_000,
);

it.runIf(canVerify)(
	"propagates decoder stderr and cleans scoped audio files",
	async () => {
		const before = new Set(
			readdirSync(tmpdir()).filter((name) =>
				name.startsWith("effect-motion-audio-"),
			),
		);
		const out = join(dir, "invalid.mp4");
		const failure = await Effect.runPromise(
			Effect.flip(
				Video.render(scene, out, { settings: { frameRate: 10 } }).pipe(
					Effect.provide(Audio.metadataLayer(Theme, { duration: 1 })),
					Effect.provide(
						Audio.layer(Theme, Effect.succeed(new Uint8Array([1, 2, 3]))),
					),
					Effect.provide(NodeServices.layer),
				),
			),
		);
		expect(failure).toBeInstanceOf(Ffmpeg.EncodeError);
		expect((failure as Ffmpeg.EncodeError).stderr.length).toBeGreaterThan(0);
		const after = readdirSync(tmpdir()).filter((name) =>
			name.startsWith("effect-motion-audio-"),
		);
		expect(after.filter((name) => !before.has(name))).toEqual([]);
	},
	30_000,
);

it.runIf(canVerify)(
	"preparation rejects invalid source bytes with ffmpeg diagnostics",
	async () => {
		const failure = await Effect.runPromise(
			Effect.flip(
				Effect.scoped(
					Layer.build(
						Video.prepareAudio(
							Theme,
							Effect.succeed(new Uint8Array([1, 2, 3])),
						),
					),
				).pipe(Effect.provide(NodeServices.layer)),
			),
		);
		expect(failure).toBeInstanceOf(Ffmpeg.EncodeError);
		expect((failure as Ffmpeg.EncodeError).stderr.length).toBeGreaterThan(0);
	},
);
