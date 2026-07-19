import { Color, Images, Motion, Scene, Shapes } from "effect-motion";

// Images are declared like fonts: the player decodes each asset once per
// mount and Image entities reference it by name. width/height are plain
// numeric fields, so scaling an image is just a tween.
export const scene = Scene.make(
	function* () {
		const rocket = yield* Scene.instantiate(Shapes.Image, {
			image: "rocket",
			x: 214,
			y: 150,
			width: 72,
			height: 72,
			opacity: 0,
		});
		const caption = yield* Scene.instantiate(Shapes.Text, {
			text: "images tween like any shape",
			x: 250,
			y: 260,
			fontSize: 20,
			fill: Color.hex("#94a3b8"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});

		yield* rocket.pipe(Motion.fadeTo(1, "500 millis"));
		yield* caption.pipe(Motion.fadeTo(1, "400 millis"));
		// lift off: move up while growing — size is data, so it tweens
		yield* Motion.tweenTo(
			rocket,
			{ x: 190, y: 40, width: 120, height: 120 },
			"1200 millis",
			"easeInOutCubic",
		);
		yield* Motion.wait("800 millis");
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
).annotate(Images.Images, [
	{
		name: "rocket",
		// a CORS-open, version-pinned PNG (72×72) — the renderer fetches
		// image assets by URL, like fonts
		src: {
			url: "https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f680.png",
		},
	},
]);
