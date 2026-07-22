import {
	Color,
	Image,
	Motion,
	Resource,
	Entity as S,
	Scene,
} from "effect-motion";

// Images are typed scene dependencies like fonts: yielding the constant
// puts `ImageLoader<"rocket">` into the scene's requirements, the layer
// loads the bytes once at mount, and the render session decodes them once —
// every frame reuses the decoded picture. width/height are plain numeric
// fields, so scaling an image is just a tween.
const Rocket = Image.Image("rocket");

export const scene = Scene.make(
	function* () {
		const rocketImage = yield* Rocket;
		const rocket = yield* Scene.instantiate("Image", {
			position: S.vec3({ x: 214, y: 150 }),
			image: rocketImage,
			width: 72,
			height: 72,
			opacity: 0,
		});
		const caption = yield* Scene.instantiate("Text", {
			position: S.vec3({ x: 250, y: 260 }),
			text: "images tween like any shape",
			fontSize: 20,
			fillColor: Color.hex("#94a3b8"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});

		yield* rocket.pipe(Motion.fadeTo(1, "500 millis"));
		yield* caption.pipe(Motion.fadeTo(1, "400 millis"));
		// lift off: move up while growing — size is data, so it tweens
		yield* Scene.all([
			rocket.pipe(
				Motion.moveTo({ x: 190, y: 40 }, "1200 millis", "easeInOutCubic"),
			),
			rocket.pipe(
				Motion.tweenTo(
					{ width: 120, height: 120 },
					"1200 millis",
					"easeInOutCubic",
				),
			),
		]);
		yield* Motion.wait("800 millis");
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);

// a CORS-open, version-pinned PNG (72×72)
export const renderLayers = Image.layer(
	Rocket,
	Resource.fetchBytes(
		"https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f680.png",
	),
);
