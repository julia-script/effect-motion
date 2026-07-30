import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Image from "effect-motion/Image";
import * as Motion from "effect-motion/Motion";
import * as Resource from "effect-motion/Resource";
import * as Scene from "effect-motion/Scene";

// Images are typed scene dependencies like fonts: the layer loads the bytes
// once at mount, the render session decodes them once, and every frame
// reuses the decoded picture. width/height are plain numeric fields, so
// scaling an image is just a tween.
const Rocket = Image.Image("rocket");

export const scene = Scene.make(
	"images",
	function* () {
		const rocketImage = yield* Rocket;
		const rocket = yield* Scene.instantiate("Image", {
			position: Entity.vec3({ y: -130 }),
			image: rocketImage,
			width: 260,
			height: 260,
			opacity: 0,
		});
		const caption = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ y: -400 }),
			text: "images tween like any shape",
			fontSize: 64,
			fillColor: Color.hex("#94a3b8"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});

		yield* rocket.pipe(Motion.fadeTo(1, "500 millis"));
		yield* caption.pipe(Motion.fadeTo(1, "400 millis"));
		// lift off: move up while growing — size is data, so it tweens
		yield* Scene.all([
			rocket.pipe(Motion.moveTo({ y: 180 }, "1200 millis", "easeInOutCubic")),
			rocket.pipe(
				Motion.tweenTo(
					{ width: 430, height: 430 },
					"1200 millis",
					"easeInOutCubic",
				),
			),
		]);
		yield* Motion.wait("800 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);

// a CORS-open, version-pinned PNG (512×512 — comfortably above the largest
// size the scene scales it to)
export const renderLayers = Image.layer(
	Rocket,
	Resource.fetchBytes(
		"https://cdn.jsdelivr.net/gh/googlefonts/noto-emoji@v2.042/png/512/emoji_u1f680.png",
	),
);
