import { Duration, Effect, Schedule } from "effect";
import * as Audio from "effect-motion/Audio";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import type * as Instance from "effect-motion/Instance";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// "One beat": a 15.5-second music ident at 120 BPM. A count-in becomes a hot
// drop, the drop folds into a sweep, the sweep crossfades into a deep drift,
// and everything collapses into a lockup on the final hit.
//
// Every cue is scheduled in scene time. The groove loop is exactly one bar,
// so its prepared duration sets the grid; nothing reads the waveform.

const ink = Color.hex("#0e0d12");
const coral = Color.hex("#ff4b36");
const cream = Color.hex("#f6ecd9");
const night = Color.hex("#0a1433");
const cyan = Color.hex("#43e4ff");
const ice = Color.hex("#d9f7ff");
const blue = Color.hex("#2448c8");
const none = Color.rgba(0, 0, 0, 0);

// Original synthesized WAVs (see audio.synth.ts). Browser and Node provide
// the same five tracks to this one scene.
export const Groove = Audio.Audio("groove");
export const Drift = Audio.Audio("drift");
export const Riser = Audio.Audio("riser");
export const Hit = Audio.Audio("hit");
export const Tick = Audio.Audio("tick");

const WIDTH = 1280;
const HEIGHT = 720;

const hide = <Tag extends "Group" | "Hud" | "Circle" | "Rect" | "Text">(
	instance: Instance.Instance<Tag>,
) => Scene.update(instance, (data) => ({ ...data, visible: false }));
const show = <Tag extends "Group" | "Hud" | "Circle" | "Rect" | "Text">(
	instance: Instance.Instance<Tag>,
) => Scene.update(instance, (data) => ({ ...data, visible: true }));

const word = (text: string, fontSize: number, fillColor: Color.Color) =>
	Scene.instantiate("Text", {
		text,
		fontSize,
		fillColor,
		textAnchor: "middle",
		baseline: "middle",
	});

export const scene = Scene.make(
	"audio",
	function* () {
		const tracks = {
			groove: yield* Groove,
			drift: yield* Drift,
			riser: yield* Riser,
			hit: yield* Hit,
			tick: yield* Tick,
		};
		// The groove is one bar long: its duration is the scene's clock.
		const bar = Duration.toMillis(yield* Audio.duration(Groove));
		const beat = bar / 4;
		const sweep = yield* Audio.duration(Riser);
		const ring = yield* Audio.duration(Hit);

		// Start the moves together and hold exactly one beat.
		const onBeat = <R>(
			...moves: ReadonlyArray<Effect.Effect<unknown, never, R>>
		) => Scene.all([...moves, Scene.sleep(beat)]);

		// ── Cast. Later shots are built up front and hidden until their cue.
		const count = yield* Scene.instantiate("Group", {});
		const numeral = yield* word("1", 460, cream);
		const marks: Instance.Instance<"Rect">[] = [];
		for (let i = 0; i < 4; i++) {
			marks.push(
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({ x: (i - 1.5) * 64, y: -300 }),
					width: 40,
					height: 6,
					fillColor: Color.hex("#34303b"),
				}),
			);
		}
		for (const child of [numeral, ...marks]) {
			yield* Scene.appendChild(count, child);
		}

		const drop = yield* Scene.instantiate("Group", {});
		const field = yield* Scene.instantiate("Circle", {
			radius: 0,
			fillColor: coral,
		});
		const streaks = [
			yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: -1500, y: 250 }),
				width: 900,
				height: 18,
				fillColor: ink,
			}),
			yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: 1500, y: -250 }),
				width: 900,
				height: 18,
				fillColor: ink,
			}),
		];
		const shout = yield* word(" ", 230, ink);
		for (const child of [field, ...streaks, shout]) {
			yield* Scene.appendChild(drop, child);
		}

		const pulse = yield* Scene.instantiate("Group", { visible: false });
		const columns: Instance.Instance<"Rect">[] = [];
		for (let i = 0; i < 8; i++) {
			const column = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: (i - 3.5) * (WIDTH / 8) }),
				scale: Entity.vec3({ x: 1, y: 0, z: 1 }),
				width: WIDTH / 8,
				height: HEIGHT,
				fillColor: i % 2 === 0 ? cream : coral,
			});
			yield* Scene.appendChild(pulse, column);
			columns.push(column);
		}
		const pulseWord = yield* word("PULSE", 300, ink);
		yield* hide(pulseWord);
		// center-out pairs, so each beat ripples from the middle
		const pairs = [0, 1, 2, 3].map((d) => [
			columns[3 - d] ?? columns[0],
			columns[4 + d] ?? columns[7],
		]);

		const backdrop = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ z: -6000 }),
			scale: Entity.vec3({ x: 1, y: 0, z: 1 }),
			width: WIDTH * 5,
			height: HEIGHT * 5,
			fillColor: night,
		});
		const tunnel = yield* Scene.instantiate("Group", { opacity: 0 });
		const rings: Instance.Instance<"Circle">[] = [];
		for (let i = 0; i < 11; i++) {
			const r = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ z: -400 * i }),
				radius: 330,
				fillColor: none,
				strokeColor: i % 3 === 0 ? cyan : blue,
				strokeWidth: 5,
			});
			yield* Scene.appendChild(tunnel, r);
			rings.push(r);
		}
		const diamond = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ z: -4400 }),
			rotation: Entity.vec3({ z: Math.PI / 4 }),
			width: 180,
			height: 180,
			fillColor: cyan,
		});
		yield* Scene.appendChild(tunnel, diamond);

		// Flat type over the moving camera.
		const title = yield* Scene.instantiate("Hud", { visible: false });
		const letters: Instance.Instance<"Text">[] = [];
		for (const [i, letter] of [..."DRIFT"].entries()) {
			const t = yield* Scene.instantiate("Text", {
				text: letter,
				position: Entity.vec3({ x: (i - 2) * 170, y: -265 }),
				fontSize: 180,
				fillColor: ice,
				textAnchor: "middle",
				baseline: "middle",
				opacity: 0,
			});
			yield* Scene.appendChild(title, t);
			letters.push(t);
		}
		const caption = yield* Scene.instantiate("Text", {
			text: "1 2 0   B P M   ·   A   M I N O R",
			position: Entity.vec3({ y: 285 }),
			fontSize: 24,
			fillColor: cyan,
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});
		yield* Scene.appendChild(title, caption);

		const lockup = yield* Scene.instantiate("Hud", { visible: false });
		const flood = yield* Scene.instantiate("Circle", {
			radius: 0,
			fillColor: cream,
		});
		const sun = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -430, y: 14 }),
			scale: Entity.vec3({ x: 0, y: 0, z: 1 }),
			radius: 54,
			fillColor: coral,
		});
		const gem = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: -305, y: 14 }),
			scale: Entity.vec3({ x: 0, y: 0, z: 1 }),
			width: 78,
			height: 78,
			fillColor: blue,
		});
		const wordmark = yield* Scene.instantiate("Text", {
			text: "effect-motion",
			position: Entity.vec3({ x: -180, y: 24 }),
			fontSize: 108,
			fillColor: ink,
			textAnchor: "start",
			baseline: "middle",
			opacity: 0,
		});
		const tagline = yield* Scene.instantiate("Text", {
			text: "sound, in scene time",
			position: Entity.vec3({ x: -176, y: -62 }),
			fontSize: 40,
			fillColor: Color.hex("#5c5249"),
			textAnchor: "start",
			baseline: "middle",
			opacity: 0,
		});
		const rule = yield* Scene.instantiate("Line", {
			start: Entity.vec3({ x: -176, y: -110 }),
			end: Entity.vec3({ x: -176, y: -110 }),
			strokeColor: coral,
			strokeWidth: 6,
		});
		for (const child of [flood, sun, gem, wordmark, tagline, rule]) {
			yield* Scene.appendChild(lockup, child);
		}

		// ── Bar 1 · count-in. Four ticks; the last one turns hot and
		// collapses into the dot the drop explodes from.
		for (const [i, mark] of marks.entries()) {
			const last = i === 3;
			yield* Audio.play(tracks.tick, { gain: last ? 1.8 : 1 });
			yield* Scene.update(numeral, (d) => ({
				...d,
				text: `${i + 1}`,
				fillColor: last ? coral : cream,
			}));
			yield* onBeat(
				Motion.scale(numeral, 1.5, 1, beat * 0.36, "easeOutExpo"),
				Motion.tweenTo(mark, { fillColor: last ? coral : cream }, beat / 5),
				last
					? Effect.gen(function* () {
							yield* Scene.sleep(beat * 0.4);
							yield* Scene.all([
								Motion.scaleTo(numeral, 0, beat * 0.6, "easeInBack"),
								Motion.tween(
									field,
									{ radius: 0 },
									{ radius: 14 },
									beat * 0.6,
									"easeInExpo",
								),
							]);
						})
					: Effect.void,
			);
		}

		// ── Bars 2–3 · the drop. The groove lands on the downbeat.
		const groove = yield* Audio.play(tracks.groove, { loop: true });
		yield* hide(count);
		yield* Scene.fork(
			Motion.tweenTo(field, { radius: 760 }, beat * 0.7, "easeOutExpo"),
		);
		for (const [i, text] of ["EVERY", "FRAME", "ON THE", "BEAT"].entries()) {
			const tilt = [-0.06, 0.05, -0.035, 0][i] ?? 0;
			yield* Scene.update(shout, (d) => ({
				...d,
				text,
				rotation: Entity.vec3({ z: tilt }),
			}));
			const [top, bottom] = streaks;
			yield* onBeat(
				Motion.scale(shout, i === 3 ? 1.9 : 1.4, 1, beat * 0.4, "easeOutExpo"),
				top === undefined
					? Effect.void
					: Motion.move(
							top,
							{ x: -1500, y: 250 },
							{ x: 1500, y: 250 },
							beat,
							"easeInOutQuart",
						),
				bottom === undefined
					? Effect.void
					: Motion.move(
							bottom,
							{ x: 1500, y: -250 },
							{ x: -1500, y: -250 },
							beat,
							"easeInOutQuart",
						),
			);
		}

		// Hard cut to black: eight columns shoot out of the center line.
		yield* hide(drop);
		yield* show(pulse);
		yield* show(pulseWord);
		const ripple = (depth: number, rise: number) =>
			Scene.stagger(
				pairs.map((pair) =>
					Scene.all(
						pair.map((column) =>
							column === undefined
								? Effect.void
								: Motion.scale(
										column,
										{ x: 1, y: depth },
										{ x: 1, y: 1 },
										rise,
										"easeOutExpo",
									),
						),
					),
				),
				Schedule.spaced(beat * 0.08),
			);
		yield* onBeat(
			ripple(0, beat * 0.6),
			Motion.scale(pulseWord, 1.8, 1, beat * 0.5, "easeOutExpo"),
		);
		for (let i = 0; i < 3; i++) {
			yield* onBeat(
				ripple(0.45, beat * 0.6),
				Motion.scale(pulseWord, 1.14, 1, beat * 0.4, "easeOutCubic"),
			);
		}

		// ── Bar 4 · the sweep. The riser's length is the transition's length,
		// and the groove crossfades into the drift across all of it.
		const drift = yield* Audio.play(tracks.drift, { gain: 0, loop: true });
		yield* Audio.play(tracks.riser);
		const sweepMs = Duration.toMillis(sweep);
		yield* Scene.all([
			Audio.crossfade(groove, drift, sweep, "easeInOutSine"),
			Scene.all([
				Motion.scaleTo(pulseWord, { x: 2.4, y: 0.6 }, beat, "easeInCubic"),
				Motion.fadeTo(pulseWord, 0, beat, "easeInCubic"),
			]),
			Effect.gen(function* () {
				// squeeze (with a small anticipatory widen), fold, stretch, open
				yield* Motion.scaleTo(pulse, { x: 0.06 }, sweepMs * 0.5, "easeInBack");
				yield* Motion.rotateTo(
					pulse,
					Math.PI / 2,
					sweepMs * 0.25,
					"easeInOutCubic",
				);
				yield* Motion.scaleTo(
					pulse,
					{ x: 0.012, y: 2.4 },
					sweepMs * 0.125,
					"easeInExpo",
				);
				yield* Scene.all([
					Motion.scale(
						backdrop,
						{ x: 1, y: 0.004 },
						{ x: 1, y: 1 },
						sweepMs * 0.125,
						"easeOutExpo",
					),
					Motion.fadeTo(pulse, 0, sweepMs * 0.125),
					Motion.fadeTo(tunnel, 1, sweepMs * 0.125, "easeOutCubic"),
				]);
			}),
		]);
		yield* Audio.stop(groove);
		yield* hide(pulse);

		// ── Bars 5–6 · drift. The camera flies through a tunnel of rings while
		// flat type rises over it; each beat flares the next ring.
		yield* show(title);
		const camera = yield* Scene.camera;
		yield* Scene.fork(
			Motion.moveTo(camera, { z: -1000 }, beat * 7, "easeInOutSine"),
		);
		yield* Scene.fork(
			Scene.stagger(
				letters.map((letter) =>
					Scene.all([
						Motion.moveTo(letter, { y: -205 }, beat * 1.4, "easeOutCubic"),
						Motion.fadeTo(letter, 1, beat * 1.4),
					]),
				),
				Schedule.spaced(beat * 0.24),
			),
		);
		yield* Scene.fork(
			Effect.gen(function* () {
				yield* Scene.sleep(beat * 2);
				yield* Motion.fadeTo(caption, 0.8, beat);
			}),
		);
		yield* Scene.fork(
			Effect.gen(function* () {
				yield* Scene.sleep(bar);
				yield* Scene.all(
					letters.map((letter, i) =>
						Motion.moveTo(letter, { x: (i - 2) * 196 }, bar * 0.75),
					),
				);
			}),
		);
		for (let i = 0; i < 7; i++) {
			const flare = rings[i + 3];
			yield* onBeat(
				flare === undefined
					? Effect.void
					: Effect.gen(function* () {
							yield* Motion.tweenTo(
								flare,
								{ strokeWidth: 22, strokeColor: ice },
								beat * 0.12,
							);
							yield* Motion.tweenTo(
								flare,
								{ strokeWidth: 5, strokeColor: cyan },
								beat * 0.7,
								"easeOutCubic",
							);
						}),
				Motion.rotateTo(
					diamond,
					Math.PI / 4 + ((i + 1) * Math.PI) / 2,
					beat * 0.6,
					"easeOutBack",
				),
			);
		}

		// ── Bar 7 · collapse. One beat of held breath: sound and picture pull
		// into a point.
		yield* onBeat(
			Audio.fadeOut(drift, beat * 0.9),
			Motion.moveTo(camera, { z: -1500 }, beat, "easeInCubic"),
			Motion.fadeTo(tunnel, 0, beat, "easeInCubic"),
			Motion.fadeTo(caption, 0, beat * 0.5),
			...letters.map((letter) =>
				Scene.all([
					Motion.moveTo(letter, { x: 0, y: 0 }, beat, "easeInBack"),
					Motion.scaleTo(letter, 0, beat, "easeInBack"),
				]),
			),
		);
		yield* Audio.stop(drift);

		// ── Bars 7–8 · lockup. The hit floods the frame and the marks from the
		// earlier shots return as a wordmark. The hit's length is the ending:
		// the picture fades out with the last beat of its chord.
		yield* Audio.play(tracks.hit);
		yield* hide(title);
		yield* hide(tunnel);
		yield* hide(backdrop);
		yield* show(lockup);
		yield* Scene.fork(
			Motion.tweenTo(flood, { radius: 760 }, beat * 0.6, "easeOutExpo"),
		);
		yield* Scene.fork(Motion.scale(lockup, 1, 1.04, ring));
		const after = <R>(
			delay: number,
			effect: Effect.Effect<unknown, never, R>,
		) =>
			Scene.fork(
				Effect.gen(function* () {
					yield* Scene.sleep(delay);
					yield* effect;
				}),
			);
		yield* after(beat * 0.3, Motion.scale(sun, 0, 1, beat, "easeOutBack"));
		yield* after(
			beat * 0.5,
			Scene.all([
				Motion.scale(gem, 0, 1, beat, "easeOutBack"),
				Motion.rotate(
					gem,
					-Math.PI / 2,
					Math.PI / 4,
					beat * 1.4,
					"easeOutCubic",
				),
			]),
		);
		yield* after(
			beat * 0.6,
			Scene.all([
				Motion.move(
					wordmark,
					{ x: -120, y: 24 },
					{ x: -180, y: 24 },
					beat,
					"easeOutExpo",
				),
				Motion.fadeTo(wordmark, 1, beat * 0.6),
			]),
		);
		yield* after(
			beat * 1.1,
			Scene.all([
				Motion.move(
					tagline,
					{ x: -176, y: -80 },
					{ x: -176, y: -62 },
					beat,
					"easeOutCubic",
				),
				Motion.fadeTo(tagline, 1, beat),
			]),
		);
		yield* after(
			beat * 1.5,
			Motion.drive(rule, beat * 1.4, "easeInOutCubic", (t, d) => ({
				...d,
				end: Entity.vec3({ x: -176 + t * 506, y: -110 }),
			})),
		);
		yield* Scene.sleep(Duration.toMillis(ring) - beat * 2);
		yield* Motion.fadeTo(lockup, 0, beat * 2, "easeInOutSine");
	},
	{ width: WIDTH, height: HEIGHT, backgroundColor: ink },
);
