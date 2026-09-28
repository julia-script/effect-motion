import * as Audio from "effect-motion/Audio";
import * as Color from "effect-motion/Color";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// The original two-second WAV is in ../public/audio-theme.wav. The scene
// contains no browser or Node code, so both adapters can run these frames.
export const Theme = Audio.Audio("theme");

export const scene = Scene.make(
	"audio",
	function* () {
		const theme = yield* Theme;
		const sourceDuration = yield* Audio.duration(Theme);
		const ring = yield* Scene.instantiate("Circle", {
			radius: 48,
			fillColor: Color.hex("#7f5af0"),
		});
		yield* Scene.instantiate("Text", {
			text: "Sound in a scene",
			fontSize: 34,
			position: { x: 0, y: -100, z: 0 },
			fillColor: Color.hex("#e2e8f0"),
			textAnchor: "middle",
			baseline: "middle",
		});

		const first = yield* Audio.play(theme, { gain: 0, loop: true });
		yield* Scene.all([
			Audio.fadeIn(first, "400 millis"),
			Motion.tweenTo(ring, { radius: 74 }, "400 millis"),
		]);
		// Playing does not extend a scene. Waiting explicitly makes its length
		// depend on the prepared source duration.
		yield* Scene.sleep(sourceDuration);

		const second = yield* Audio.play(theme, {
			from: 0.75,
			gain: 0,
			loop: true,
		});
		yield* Audio.crossfade(first, second, "500 millis");
		yield* Audio.pause(first);
		yield* Motion.tweenTo(second, { gain: 0.45 }, "300 millis");
		yield* Audio.seek(second, 0.5);
		yield* Audio.fadeOut(second, "500 millis");
		yield* Audio.stop(second);
	},
	{ width: 640, height: 360, backgroundColor: Color.hex("#16161d") },
);
