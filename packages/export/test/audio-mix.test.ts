import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { afterAll, expect, it } from "vitest";
import * as AudioMix from "../src/AudioMix";
import * as Ffmpeg from "../src/Ffmpeg";

const dir = mkdtempSync(join(tmpdir(), "effect-motion-mix-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const sampleAt = (bytes: Uint8Array, sample: number): number =>
	new DataView(bytes.buffer, bytes.byteOffset).getFloat32(
		sample * Ffmpeg.pcm.bytesPerSampleFrame,
		true,
	);

it("interpolates source position and ramps gain over synthetic sine samples", () => {
	const source = new Float32Array(22);
	for (let i = 0; i < source.length / 2; i++) {
		const value = Math.sin((2 * Math.PI * i) / 8);
		source[i * 2] = value;
		source[i * 2 + 1] = value;
	}
	const out = new Float32Array(8);
	AudioMix.mixSamples(out, source, 0.5, 1, 0);
	for (let i = 0; i < 4; i++) {
		const interpolated =
			(source[i * 2] ?? 0) * 0.5 + (source[(i + 1) * 2] ?? 0) * 0.5;
		expect(out[i * 2]).toBeCloseTo(interpolated * (1 - (i + 1) / 4), 5);
		expect(out[i * 2 + 1]).toBeCloseTo(out[i * 2] ?? 0, 5);
	}
	expect(out[6]).toBe(0);
});

it("mixes separate instances of one asset through offsets, pause, loop and stop", async () => {
	const samples = Ffmpeg.pcm.sampleRate;
	const source = new Float32Array(samples * 2);
	for (let i = 0; i < samples; i++) {
		const value = [0.5, 0.25, -0.5, -0.25][Math.floor(i / (samples / 4))] ?? 0;
		source[i * 2] = value;
		source[i * 2 + 1] = value;
	}
	const sourcePath = join(dir, "source.f32le");
	const outPath = join(dir, "mixed.f32le");
	writeFileSync(sourcePath, Buffer.from(source.buffer));
	const track = (
		instanceId: string,
		time: number,
		playing: boolean,
		gain = 1,
		loop = false,
	): AudioMix.Track => ({
		instanceId,
		assetId: "same",
		time,
		playing,
		gain,
		loop,
	});
	const timeline: AudioMix.TimelineFrame[] = [
		{ frame: 0, tracks: [track("a", 0.25, true), track("b", 0.5, true, 0.5)] },
		{ frame: 1, tracks: [track("a", 0.5, true), track("b", 0.75, false, 0.5)] },
		{
			frame: 2,
			tracks: [track("a", 0.75, true, 1, true), track("b", 0, false)],
		},
		{ frame: 3, tracks: [track("a", 1, true, 1, true), track("b", 0, false)] },
		{ frame: 4, tracks: [track("a", 1.25, false, 1, true)] },
	];
	await Effect.runPromise(
		AudioMix.write(timeline, 4, new Map([["same", sourcePath]]), outPath).pipe(
			Effect.provide(NodeServices.layer),
		),
	);
	const output = readFileSync(outPath);
	expect(output.byteLength).toBe(
		5 * 0.25 * samples * Ffmpeg.pcm.bytesPerSampleFrame,
	);
	expect(sampleAt(output, 100)).toBeCloseTo(0, 5);
	expect(sampleAt(output, samples / 4 + 100)).toBeCloseTo(-0.5, 5);
	expect(sampleAt(output, samples / 2 + 100)).toBeCloseTo(-0.25, 5);
	expect(sampleAt(output, (samples * 3) / 4 + 100)).toBeCloseTo(0.5, 5);
	expect(sampleAt(output, samples + 100)).toBe(0);
});

it("aligns fractional frame rates to absolute output sample times", async () => {
	const sampleRate = Ffmpeg.pcm.sampleRate;
	const source = new Float32Array(sampleRate * 2 * 2);
	for (let i = 0; i < sampleRate * 2; i++) {
		source[i * 2] = i / sampleRate;
		source[i * 2 + 1] = i / sampleRate;
	}
	const sourcePath = join(dir, "ramp.f32le");
	const outPath = join(dir, "fractional.f32le");
	writeFileSync(sourcePath, Buffer.from(source.buffer));
	const frameRate = 29.97;
	const frames: AudioMix.TimelineFrame[] = Array.from(
		{ length: 30 },
		(_, frame) => ({
			frame,
			tracks: [
				{
					instanceId: "ramp",
					assetId: "ramp",
					time: frame / frameRate,
					gain: 1,
					loop: false,
					playing: true,
				},
			],
		}),
	);
	await Effect.runPromise(
		AudioMix.write(
			frames,
			frameRate,
			new Map([["ramp", sourcePath]]),
			outPath,
		).pipe(Effect.provide(NodeServices.layer)),
	);
	const output = readFileSync(outPath);
	for (let frame = 0; frame < 30; frame++) {
		const sample = Math.round((frame * sampleRate) / frameRate);
		expect(
			Math.abs(sampleAt(output, sample) - sample / sampleRate),
		).toBeLessThan(2e-7);
	}
});
