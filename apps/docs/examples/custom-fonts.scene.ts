import { Color, Fonts, Motion, Scene, Shapes } from "effect-motion";

// The player reads the Fonts annotation and loads the declared face while
// it buffers frames, so the first visible frame is already in Pacifico —
// no flash of fallback text.
export const scene = Scene.make(function* () {
	const custom = yield* Scene.instantiate(Shapes.Text, {
		text: "Custom fonts",
		x: 250,
		y: 120,
		fontSize: 48,
		fontFamily: "Pacifico",
		fill: Color.hex("#7f5af0"),
		textAnchor: "middle",
		baseline: "middle",
		opacity: 0,
	});
	const plain = yield* Scene.instantiate(Shapes.Text, {
		text: "vs the default sans-serif",
		x: 250,
		y: 190,
		fontSize: 20,
		fill: Color.hex("#94a3b8"),
		textAnchor: "middle",
		baseline: "middle",
		opacity: 0,
	});

	yield* custom.pipe(Motion.fadeTo(1, "600 millis"));
	yield* plain.pipe(Motion.fadeTo(1, "600 millis"));
	yield* Motion.wait("1 second");
}).annotate(Fonts.Fonts, [
	{
		family: "Pacifico",
		// the ThorVG renderer loads TrueType (.ttf) fonts by URL — not woff2 —
		// so declared faces point at a .ttf asset
		src: {
			url: "https://cdn.jsdelivr.net/npm/@expo-google-fonts/pacifico@0.2.3/Pacifico_400Regular.ttf",
		},
	},
]);
