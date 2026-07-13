import { Motion, Scene, Shapes } from "effect-motion";

const richText = {
	type: "root",
	children: [
		{
			type: "paragraph",
			children: [
				{ type: "text", value: "effect-" },
				{
					type: "strong",
					children: [{ type: "text", value: "motion" }],
				},
				{ type: "text", value: " with " },
				{
					type: "emphasis",
					children: [{ type: "text", value: "Effect" }],
				},
			],
		},
	],
} satisfies Shapes.TextContent;

// Centering stays entity-level; rich runs inherit the Text's shape styles.
export const scene = Scene.make(function* () {
	const title = yield* Scene.instantiate(Shapes.Text, {
		text: richText,
		x: 250,
		y: 150,
		fontSize: 8,
		opacity: 0,
		fill: "#7f5af0",
		textAnchor: "middle",
		baseline: "middle",
	});

	// fontSize is still a number, so the whole rich Text tweens together.
	yield* Scene.all([
		title.pipe(Motion.fadeTo(1, "400 millis")),
		title.pipe(Motion.tweenTo({ fontSize: 42 }, "700 millis", "easeOutBack")),
	]);

	yield* Motion.wait("400 millis");
	yield* title.pipe(
		Motion.moveTo({ y: 120 }, "500 millis", "easeInOutCubic"),
		Motion.fadeTo(0.35, "500 millis"),
	);
});
