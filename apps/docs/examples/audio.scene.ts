import * as Effect from "effect/Effect";
import * as Audio from "effect-motion/Audio";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import type * as Instance from "effect-motion/Instance";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

const ink = Color.hex("#101821");
const coral = Color.hex("#ff7866");
const amber = Color.hex("#ffc67d");
const cyan = Color.hex("#76e2f2");
const ice = Color.hex("#dff8f7");

// Original local WAVs. The same scene runs in the docs Player and Node.
export const Warm = Audio.Audio("warm");
export const Cool = Audio.Audio("cool");
export const Accent = Audio.Audio("accent");

const ripple = Effect.fnUntraced(function* (
	group: Instance.Instance<"Group">,
	x: number,
	color: Color.Color,
) {
	const ring = yield* Scene.instantiate("Circle", {
		position: Entity.vec3({ x, z: -2 }),
		radius: 22,
		fillColor: ink,
		strokeColor: color,
		strokeWidth: 2,
		opacity: 0.8,
	});
	yield* Scene.appendChild(group, ring);
	yield* Scene.fork(
		Scene.all([
			Motion.tweenTo(ring, { radius: 112 }, "650 millis", "easeOutCubic"),
			Motion.fadeTo(ring, 0, "650 millis"),
		]),
	);
});

export const scene = Scene.make(
	"audio",
	function* () {
		const warmTrack = yield* Warm;
		const coolTrack = yield* Cool;
		const accentTrack = yield* Accent;
		const warmDuration = yield* Audio.duration(Warm);
		const accentDuration = yield* Audio.duration(Accent);

		// A quiet frame gives the moving shapes room to breathe.
		for (const y of [-123, 122]) {
			yield* Scene.instantiate("Line", {
				start: Entity.vec3({ x: -265, y }),
				end: Entity.vec3({ x: 265, y }),
				strokeColor: Color.hex("#2b3944"),
				strokeWidth: 1,
			});
		}

		const warm = yield* Scene.instantiate("Group", {});
		const warmOrbit = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -75, z: -3 }),
			radius: 87,
			fillColor: ink,
			strokeColor: Color.hex("#7c4547"),
			strokeWidth: 2,
		});
		const heart = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: -75, z: 2 }),
			radius: 31,
			fillColor: coral,
		});
		const warmWord = yield* Scene.instantiate("Text", {
			text: "PULSE",
			position: Entity.vec3({ x: 148, y: 99, z: 2 }),
			fontSize: 26,
			fillColor: amber,
			textAnchor: "middle",
			baseline: "middle",
		});
		for (const shape of [warmOrbit, heart, warmWord]) {
			yield* Scene.appendChild(warm, shape);
		}
		const warmBars: Instance.Instance<"Rect">[] = [];
		for (let i = 0; i < 5; i++) {
			const bar = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: 92 + i * 29, y: -28, z: 1 }),
				width: 12,
				height: 16,
				fillColor: i % 2 === 0 ? coral : amber,
			});
			yield* Scene.appendChild(warm, bar);
			warmBars.push(bar);
		}
		for (const [x, y, radius] of [
			[33, 76, 5],
			[214, 69, 4],
			[179, -76, 7],
		]) {
			const dot = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x, y, z: 1 }),
				radius,
				fillColor: amber,
			});
			yield* Scene.appendChild(warm, dot);
		}
		const ember = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: 12, z: 3 }),
			radius: 6,
			fillColor: amber,
		});
		yield* Scene.appendChild(warm, ember);

		const cool = yield* Scene.instantiate("Group", {
			position: Entity.vec3({ x: 40 }),
			opacity: 0,
		});
		const coolOrbit = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: 71, z: -3 }),
			radius: 99,
			fillColor: ink,
			strokeColor: Color.hex("#376f80"),
			strokeWidth: 2,
		});
		const crystal = yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: 71, z: 2 }),
			rotation: Entity.vec3({ z: Math.PI / 4 }),
			width: 62,
			height: 62,
			fillColor: cyan,
		});
		const coolWord = yield* Scene.instantiate("Text", {
			text: "DRIFT",
			position: Entity.vec3({ x: -153, y: -99, z: 2 }),
			fontSize: 26,
			fillColor: ice,
			textAnchor: "middle",
			baseline: "middle",
		});
		for (const shape of [coolOrbit, crystal, coolWord]) {
			yield* Scene.appendChild(cool, shape);
		}
		const coolBars: Instance.Instance<"Rect">[] = [];
		for (let i = 0; i < 5; i++) {
			const bar = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: -216 + i * 29, y: -30, z: 1 }),
				width: 12,
				height: 16,
				fillColor: i % 2 === 0 ? cyan : ice,
			});
			yield* Scene.appendChild(cool, bar);
			coolBars.push(bar);
		}
		for (const [x, y, radius] of [
			[-196, 70, 4],
			[-80, -76, 6],
			[209, 71, 5],
		]) {
			const dot = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x, y, z: 1 }),
				radius,
				fillColor: ice,
			});
			yield* Scene.appendChild(cool, dot);
		}
		const glint = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ x: 170, z: 3 }),
			radius: 5,
			fillColor: ice,
		});
		yield* Scene.appendChild(cool, glint);
		const closingWord = yield* Scene.instantiate("Text", {
			text: "breathe",
			position: Entity.vec3({ x: 0, y: -93, z: 5 }),
			fontSize: 20,
			fillColor: ice,
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});

		const warmAudio = yield* Audio.play(warmTrack, { gain: 0.55, loop: true });
		yield* Scene.fork(
			Motion.drive(ember, warmDuration, "linear", (t, data) => ({
				...data,
				position: Entity.vec3({
					x: -75 + Math.cos(t * Math.PI * 2) * 87,
					y: Math.sin(t * Math.PI * 2) * 87,
					z: 3,
				}),
			})),
		);
		// A clipped accent marks four warm beats; the music source sets the
		// whole section's duration through its prepared metadata.
		yield* Scene.fork(
			Effect.gen(function* () {
				for (let beat = 0; beat < 8; beat++) {
					yield* ripple(warm, -75, coral);
					if (beat % 2 === 0) {
						yield* Audio.play(accentTrack, {
							gain: 0.23,
							duration: accentDuration,
						});
					}
					const bar = warmBars[beat % warmBars.length];
					if (bar !== undefined) {
						yield* Scene.all([
							Motion.scaleTo(heart, 1.22, "100 millis", "easeOutCubic"),
							Motion.tweenTo(bar, { height: 61 }, "100 millis"),
						]);
						yield* Scene.all([
							Motion.scaleTo(heart, 1, "200 millis", "easeOutCubic"),
							Motion.tweenTo(bar, { height: 16 }, "200 millis"),
						]);
					}
					yield* Scene.sleep("200 millis");
				}
			}),
		);
		yield* Scene.sleep(warmDuration);

		const coolAudio = yield* Audio.play(coolTrack, { gain: 0, loop: true });
		yield* Scene.fork(
			Motion.drive(glint, "6 seconds", "linear", (t, data) => ({
				...data,
				position: Entity.vec3({
					x: 71 + Math.cos(t * Math.PI * 3) * 99,
					y: Math.sin(t * Math.PI * 3) * 99,
					z: 3,
				}),
			})),
		);
		yield* Scene.fork(
			Effect.gen(function* () {
				for (let beat = 0; beat < 12; beat++) {
					yield* ripple(cool, 71, cyan);
					if (beat % 3 === 0) {
						yield* Audio.play(accentTrack, {
							gain: 0.16,
							duration: accentDuration,
						});
					}
					const bar = coolBars[beat % coolBars.length];
					if (bar !== undefined) {
						yield* Scene.all([
							Motion.scaleTo(crystal, 1.2, "100 millis", "easeOutCubic"),
							Motion.rotateTo(
								crystal,
								((beat + 1) * Math.PI) / 4,
								"100 millis",
							),
							Motion.tweenTo(bar, { height: 57 }, "100 millis"),
						]);
						yield* Scene.all([
							Motion.scaleTo(crystal, 1, "200 millis", "easeOutCubic"),
							Motion.tweenTo(bar, { height: 16 }, "200 millis"),
						]);
					}
					yield* Scene.sleep("200 millis");
				}
			}),
		);
		// The audio crossfade and the visible palette change share a span.
		yield* Scene.all([
			Audio.crossfade(warmAudio, coolAudio, "1500 millis"),
			Motion.fadeTo(warm, 0, "1500 millis"),
			Motion.fadeTo(cool, 1, "1500 millis"),
			Motion.moveTo(warm, { x: -40 }, "1500 millis", "easeInOutCubic"),
			Motion.moveTo(cool, { x: 0 }, "1500 millis", "easeInOutCubic"),
		]);
		yield* Audio.stop(warmAudio);
		yield* Scene.sleep("4500 millis");

		// Sound and movement recede together into one settled shape.
		yield* Scene.all([
			Audio.fadeOut(coolAudio, "1200 millis"),
			Motion.fadeTo(cool, 0.55, "1200 millis"),
			Motion.scaleTo(crystal, 0.74, "1200 millis", "easeOutCubic"),
			Motion.fadeTo(closingWord, 1, "1200 millis"),
		]);
		yield* Audio.stop(coolAudio);
	},
	{ width: 640, height: 360, backgroundColor: ink },
);
