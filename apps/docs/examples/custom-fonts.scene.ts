import {
	Color,
	Font,
	Motion,
	Resource,
	Entity as S,
	Scene,
} from "effect-motion";

// Fonts are typed scene dependencies: yielding the constant puts
// `FontLoader<"Pacifico">` into the scene's requirements, and the player
// will not compile without a covering `renderLayers`. The layer's load runs
// once at mount (before anything renders), so the first visible frame is
// already in Pacifico — no flash of fallback text.
const Pacifico = Font.Font("Pacifico");

export const scene = Scene.make(
	function* () {
		const pacifico = yield* Pacifico;
		const custom = yield* Scene.instantiate("Text", {
			position: S.vec3({ x: 250, y: 120 }),
			text: "Custom fonts",
			fontSize: 48,
			fontFamily: pacifico,
			fillColor: Color.hex("#7f5af0"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});
		// no fontFamily: the built-in default font (reserved id "sans-serif",
		// auto-provided by the render path) — zero ceremony, no requirement
		const plain = yield* Scene.instantiate("Text", {
			position: S.vec3({ x: 250, y: 190 }),
			text: "vs the default sans-serif",
			fontSize: 20,
			fillColor: Color.hex("#94a3b8"),
			textAnchor: "middle",
			baseline: "middle",
			opacity: 0,
		});

		yield* custom.pipe(Motion.fadeTo(1, "600 millis"));
		yield* plain.pipe(Motion.fadeTo(1, "600 millis"));
		yield* Motion.wait("1 second");
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);

// the ThorVG renderer rasterizes TrueType (.ttf) — not woff2 — so the load
// effect points at a .ttf asset. Providing a loader under the reserved
// "sans-serif" id would instead OVERRIDE the built-in default font.
export const renderLayers = Font.layer(
	Pacifico,
	Resource.fetchBytes(
		"https://cdn.jsdelivr.net/npm/@expo-google-fonts/pacifico@0.2.3/Pacifico_400Regular.ttf",
	),
);
