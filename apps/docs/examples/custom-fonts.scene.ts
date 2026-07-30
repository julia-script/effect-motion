import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Font from "effect-motion/Font";
import * as Motion from "effect-motion/Motion";
import * as Resource from "effect-motion/Resource";
import * as Scene from "effect-motion/Scene";

// Fonts are typed scene dependencies: yielding the constant puts
// FontLoader<"Pacifico"> into the scene's requirements, and the player will
// not compile without a covering renderLayers. The load runs once at mount,
// so the first visible frame is already in Pacifico.
const Pacifico = Font.Font("Pacifico");

export const scene = Scene.make(
	"custom fonts",
	function* () {
		const pacifico = yield* Pacifico;
		const custom = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ y: 110 }),
			text: "Custom fonts",
			fontSize: 160,
			fontFamily: pacifico,
			fillColor: Color.hex("#7f5af0"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});
		// no fontFamily: the built-in default face — zero ceremony, no requirement
		const plain = yield* Scene.instantiate("Text", {
			position: Entity.vec3({ y: -140 }),
			text: "vs the default sans-serif",
			fontSize: 64,
			fillColor: Color.hex("#94a3b8"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});

		yield* custom.pipe(Motion.fadeTo(1, "600 millis"));
		yield* plain.pipe(Motion.fadeTo(1, "600 millis"));
		yield* Motion.wait("1 second");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);

// a CORS-open, version-pinned TrueType file; in Node the same layer could
// read the bytes from disk instead
export const renderLayers = Font.layer(
	Pacifico,
	Resource.fetchBytes(
		"https://cdn.jsdelivr.net/npm/@expo-google-fonts/pacifico@0.2.3/Pacifico_400Regular.ttf",
	),
);
