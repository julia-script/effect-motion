import { Schedule } from "effect";
import { Motion, Physics, Scene, Shapes } from "effect-motion";

const finalCaption = "Some lights meet you halfway.";

export const scene = Scene.make(function* () {
	// A quiet room, one closed window, and a very ambitious moth.
	yield* Scene.instantiate(Shapes.Rect, {
		x: 0,
		y: 0,
		width: 500,
		height: 300,
		fill: "#101522",
	});
	yield* Scene.instantiate(Shapes.Rect, {
		x: 350,
		y: 22,
		width: 130,
		height: 190,
		fill: "#17213a",
		stroke: "#64748b",
		strokeWidth: 2,
	});
	for (const [x, y, radius] of [
		[375, 48, 2],
		[402, 92, 1],
		[454, 126, 2],
		[383, 168, 1],
	] as const) {
		yield* Scene.instantiate(Shapes.Circle, {
			x,
			y,
			radius,
			fill: "#dbeafe",
			opacity: 0.75,
		});
	}
	yield* Scene.instantiate(Shapes.Line, {
		x: 350,
		y: 22,
		x2: 350,
		y2: 212,
		stroke: "#94a3b8",
		strokeWidth: 3,
	});
	yield* Scene.instantiate(Shapes.Rect, {
		x: 0,
		y: 255,
		width: 500,
		height: 45,
		fill: "#252d3a",
	});

	// instantiate children that need handles first, then group them via the
	// children list — the group adopts them (reparents out of the root)
	const halo = yield* Scene.instantiate(Shapes.Circle, {
		x: 0,
		y: 0,
		radius: 42,
		fill: "#fde68a",
		opacity: 0.14,
	});
	const moon = yield* Scene.instantiate(Shapes.Group, {
		x: 424,
		y: 72,
		children: [
			halo,
			Scene.instantiate(Shapes.Circle, {
				x: 0,
				y: 0,
				radius: 29,
				fill: "#fef3c7",
			}),
			Scene.instantiate(Shapes.Circle, {
				x: -9,
				y: -7,
				radius: 4,
				fill: "#e7d7a5",
				opacity: 0.55,
			}),
		],
	});

	const leftWing = yield* Scene.instantiate(Shapes.Ellipse, {
		x: -8,
		y: -1,
		rx: 11,
		ry: 7,
		fill: "#f9a8d4",
		opacity: 0.85,
	});
	const rightWing = yield* Scene.instantiate(Shapes.Ellipse, {
		x: 8,
		y: -1,
		rx: 11,
		ry: 7,
		fill: "#c4b5fd",
		opacity: 0.85,
	});
	const moth = yield* Scene.instantiate(Shapes.Group, {
		x: 48,
		y: 224,
		opacity: 0,
		children: [
			leftWing,
			rightWing,
			Scene.instantiate(Shapes.Ellipse, {
				x: 0,
				y: 1,
				rx: 7,
				ry: 4,
				fill: "#fbbf24",
			}),
		],
	});

	const caption = yield* Scene.instantiate(Shapes.Text, {
		text: "ONE TINY MOTH. ONE VERY LARGE MOON.",
		x: 250,
		y: 32,
		fontSize: 14,
		fill: "#f8fafc",
		opacity: 0,
		textAnchor: "middle",
	});

	yield* Scene.all([
		caption.pipe(Motion.fadeTo(1, "500 millis")),
		moth.pipe(Motion.fadeTo(1, "500 millis")),
	]);
	yield* Motion.wait("700 millis");
	yield* caption.pipe(Motion.fadeTo(0, "300 millis"));

	// Wings keep flapping independently while the moth attempts the commute.
	yield* Scene.background(
		Scene.repeat(
			Scene.all([
				leftWing.pipe(
					Motion.tweenTo({ ry: 2 }, "110 millis", "easeInOutCubic"),
					Motion.tweenTo({ ry: 7 }, "110 millis", "easeInOutCubic"),
				),
				rightWing.pipe(
					Motion.tweenTo({ ry: 2 }, "110 millis", "easeInOutCubic"),
					Motion.tweenTo({ ry: 7 }, "110 millis", "easeInOutCubic"),
				),
			]),
			Schedule.recurs(40),
		),
	);

	yield* moth.pipe(
		Motion.moveTo({ x: 126, y: 172 }, "450 millis", "easeOutCubic"),
		Motion.moveTo({ x: 212, y: 102 }, "520 millis", "easeInOutCubic"),
		Motion.moveTo({ x: 304, y: 126 }, "480 millis", "easeInOutCubic"),
		Motion.moveTo({ x: 350, y: 104 }, "260 millis", "easeInCubic"),
	);

	// The midpoint of every heroic journey: glass.
	yield* Scene.update(caption, (data) => ({ ...data, text: "bonk." }));
	yield* Scene.all([
		caption.pipe(Motion.fadeTo(1, "180 millis")),
		moth.pipe(
			Motion.moveTo({ x: 320, y: 132 }, "220 millis", "easeOutBack"),
			Motion.moveTo({ x: 282, y: 236 }, "650 millis", "easeInCubic"),
		),
	]);
	yield* Motion.wait("450 millis");
	yield* caption.pipe(Motion.fadeTo(0, "250 millis"));

	yield* Scene.update(caption, (data) => ({
		...data,
		text: "The moon reconsidered long-distance.",
	}));
	yield* Scene.all([
		caption.pipe(Motion.fadeTo(1, "500 millis")),
		moon.pipe(
			Motion.moveTo({ x: 320, y: 182 }, "1.15 seconds", "easeInOutCubic"),
		),
		halo.pipe(Motion.tweenTo({ radius: 50 }, "1.15 seconds", "easeInOutCubic")),
	]);
	yield* Motion.wait("350 millis");
	yield* caption.pipe(Motion.fadeTo(0, "250 millis"));

	// A recovery hop becomes a tiny orbit: gratitude, moth-style.
	yield* Physics.springTo(moth, { x: 286, y: 184 }, "jump");
	yield* Scene.all([
		moth.pipe(
			Motion.moveTo({ x: 292, y: 150 }, "280 millis", "easeInOutCubic"),
			Motion.moveTo({ x: 326, y: 138 }, "280 millis", "easeInOutCubic"),
			Motion.moveTo({ x: 358, y: 180 }, "280 millis", "easeInOutCubic"),
			Motion.moveTo({ x: 326, y: 216 }, "280 millis", "easeInOutCubic"),
			Motion.moveTo({ x: 298, y: 182 }, "280 millis", "easeInOutCubic"),
		),
		moon.pipe(
			Motion.moveTo({ y: 174 }, "700 millis", "easeInOutCubic"),
			Motion.moveTo({ y: 182 }, "700 millis", "easeInOutCubic"),
		),
	]);

	yield* Scene.update(caption, (data) => ({
		...data,
		text: finalCaption,
		y: 238,
		fontSize: 18,
	}));
	yield* Scene.all([
		moon.pipe(
			Motion.moveTo({ x: 424, y: 72 }, "1.35 seconds", "easeInOutCubic"),
		),
		moth.pipe(
			Motion.moveTo({ x: 440, y: 56 }, "1.35 seconds", "easeInOutCubic"),
		),
		caption.pipe(Motion.fadeTo(1, "800 millis")),
	]);
	yield* Motion.wait("1 second");
});
