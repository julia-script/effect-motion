import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Synthesizes the audio example's five WAVs from oscillators and seeded
// noise — no sampled or downloaded material. Regenerate from the repo root:
// bun apps/docs/examples/audio.synth.ts
//
// Everything sits on one 120 BPM grid in A minor: a beat is 0.5 s and the
// groove and drift loops are exactly one 2 s bar, so the scene can read its
// bar length from the groove's duration. Loops are written circularly (tails
// wrap to the start), so they repeat without a seam.

const RATE = 32_000;
const BEAT = 0.5;
const BAR = 4 * BEAT;

let seed = 0x5eed;
const noise = () => {
	seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
	return seed / 2 ** 31 - 1;
};

type Voice = (t: number) => number;

// Adds `voice` from `start` for `length` seconds; wraps when `loop` is set.
const add = (
	buffer: Float32Array,
	start: number,
	length: number,
	voice: Voice,
	loop = false,
) => {
	const from = Math.round(start * RATE);
	for (let i = 0; i < Math.round(length * RATE); i++) {
		const at = loop ? (from + i) % buffer.length : from + i;
		if (at < buffer.length) {
			buffer[at] = (buffer[at] ?? 0) + voice(i / RATE);
		}
	}
};

const decay = (t: number, time: number) => Math.exp(-t / time);
const sine = (hz: number, t: number) => Math.sin(2 * Math.PI * hz * t);

const kick: Voice = (t) => {
	// pitch falls 150 → 45 Hz; phase is the integral of that sweep
	const phase = 45 * t + 105 * 0.03 * (1 - Math.exp(-t / 0.03));
	return Math.sin(2 * Math.PI * phase) * decay(t, 0.16);
};
const bell =
	(hz: number, time: number): Voice =>
	(t) =>
		(sine(hz, t) + 0.35 * sine(hz * 2.76, t) * decay(t, time / 4)) *
		decay(t, time) *
		Math.min(1, t / 0.004);

// One-pole high-pass on seeded noise: bright, short percussion.
const hiss = (time: number, brightness: number): Voice => {
	let last = 0;
	return (t) => {
		const n = noise();
		const out = n - brightness * last;
		last = n;
		return out * decay(t, time);
	};
};

const groove = () => {
	const bar = new Float32Array(BAR * RATE);
	for (let beat = 0; beat < 4; beat++) {
		add(bar, beat * BEAT, 0.6, kick, true);
		add(bar, beat * BEAT + BEAT / 2, 0.08, hiss(0.018, 0.95), true);
		if (beat % 2 === 1) {
			const clap = hiss(0.07, 0.6);
			add(bar, beat * BEAT, 0.3, (t) => 0.55 * clap(t), true);
		}
	}
	// offbeat bass: A1 A1 C2 G1, a little saw for bite
	for (const [beat, hz] of [
		[0, 55],
		[1, 55],
		[2, 65.41],
		[3, 49],
	] as const) {
		add(
			bar,
			beat * BEAT + BEAT / 2,
			0.24,
			(t) =>
				(0.6 * sine(hz, t) + 0.2 * sine(hz * 2, t) + 0.1 * sine(hz * 3, t)) *
				decay(t, 0.12) *
				Math.min(1, t / 0.005),
			true,
		);
	}
	return bar;
};

const drift = () => {
	const bar = new Float32Array(BAR * RATE);
	// Am9 pad; every partial is a multiple of 0.5 Hz, so the bar loops cleanly
	const pad = [110, 131, 165, 196, 247];
	add(
		bar,
		0,
		BAR,
		(t) =>
			(pad.reduce((sum, hz) => sum + sine(hz, t) + 0.3 * sine(hz * 2, t), 0) /
				pad.length) *
			(0.75 + 0.25 * sine(1, t)),
		true,
	);
	// bell arpeggio E5 G5 B5 A5, one per beat
	for (const [beat, hz] of [659.25, 783.99, 987.77, 880].entries()) {
		add(bar, beat * BEAT, BAR, bell(hz, 0.7), true);
	}
	return bar;
};

const riser = () => {
	const length = 4 * BEAT;
	const out = new Float32Array(length * RATE);
	let low = 0;
	add(out, 0, length, (t) => {
		const p = t / length;
		// noise through a low-pass whose cutoff sweeps 200 Hz → 9 kHz
		const cutoff = 200 * (9_000 / 200) ** p;
		low += (1 - Math.exp((-2 * Math.PI * cutoff) / RATE)) * (noise() - low);
		const glide = Math.sin(
			(2 * Math.PI * 220 * length * (2 ** (2 * p) - 1)) / (2 * Math.log(2)),
		);
		const fadeOut = Math.min(1, (length - t) / 0.02);
		return (0.8 * low + 0.25 * glide) * p * p * fadeOut;
	});
	return out;
};

const hit = () => {
	const length = 3.5;
	const out = new Float32Array(length * RATE);
	add(out, 0, length, (t) => {
		const phase = 36 * t + 74 * 0.05 * (1 - Math.exp(-t / 0.05));
		return Math.sin(2 * Math.PI * phase) * decay(t, 0.45);
	});
	const crack = hiss(0.04, 0.3);
	add(out, 0, 0.3, (t) => 0.5 * crack(t));
	// the payoff resolves to A major
	for (const hz of [440, 554.37, 659.25, 880]) {
		add(out, 0.01, length, (t) => 0.3 * bell(hz, 1.3)(t));
	}
	for (let i = 0; i < RATE; i++) {
		const at = out.length - 1 - i;
		out[at] = (out[at] ?? 0) * (i / RATE);
	}
	return out;
};

const tick = () => {
	const out = new Float32Array(0.08 * RATE);
	add(out, 0, 0.08, (t) => bell(1_760, 0.018)(t));
	return out;
};

// 16-bit mono PCM, normalized to `peakDb`. The mix is set here, so the
// scene plays every source at unity gain and crossfades land on 1.
const wav = (samples: Float32Array, peakDb: number) => {
	const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
	const gain = peak === 0 ? 0 : 10 ** (peakDb / 20) / peak;
	const data = Buffer.alloc(44 + samples.length * 2);
	data.write("RIFF", 0);
	data.writeUInt32LE(36 + samples.length * 2, 4);
	data.write("WAVEfmt ", 8);
	data.writeUInt32LE(16, 16);
	data.writeUInt16LE(1, 20);
	data.writeUInt16LE(1, 22);
	data.writeUInt32LE(RATE, 24);
	data.writeUInt32LE(RATE * 2, 28);
	data.writeUInt16LE(2, 32);
	data.writeUInt16LE(16, 34);
	data.write("data", 36);
	data.writeUInt32LE(samples.length * 2, 40);
	samples.forEach((s, i) => {
		data.writeInt16LE(Math.round(s * gain * 32_767), 44 + i * 2);
	});
	return data;
};

for (const [name, samples, peakDb] of [
	["groove", groove(), -2],
	["drift", drift(), -8],
	["riser", riser(), -6],
	["hit", hit(), -1.5],
	["tick", tick(), -9],
] as const) {
	writeFileSync(
		fileURLToPath(new URL(`../public/audio-${name}.wav`, import.meta.url)),
		wav(samples, peakDb),
	);
}
