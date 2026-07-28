import { Schedule } from "effect";
import { Color, Motion, Physics, Entity as S, Scene } from "effect-motion";

const finalCaption = "Some lights meet you halfway.";

export const scene = Scene.make(
	function* () {
		// A quiet room, one closed window, and a very ambitious moth.
		yield* Scene.instantiate("Rect", {
			position: S.vec3({ x: 0, y: 0 }),
			width: 500,
			height: 300,
			fillColor: Color.hex("#101522"),
		});
		yield* Scene.instantiate("Rect", {
			position: S.vec3({ x: 165, y: 33 }),
			width: 130,
			height: 190,
			fillColor: Color.hex("#17213a"),
			strokeColor: Color.hex("#64748b"),
			strokeWidth: 2,
		});
		for (const [x, y, radius] of [
			[125, 102, 2],
			[152, 58, 1],
			[204, 24, 2],
			[133, -18, 1],
		] as const) {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x, y }),
				radius,
				fillColor: Color.hex("#dbeafe"),
				opacity: 0.75,
			});
		}
		yield* Scene.instantiate("Line", {
			position: S.vec3({ x: 100, y: 128 }),
			end: S.vec3({ x: 0, y: -190 }),
			strokeColor: Color.hex("#94a3b8"),
			strokeWidth: 3,
		});
		yield* Scene.instantiate("Rect", {
			position: S.vec3({ x: 0, y: -127.5 }),
			width: 500,
			height: 45,
			fillColor: Color.hex("#252d3a"),
		});

		// instantiate children that need handles first, then group them via the
		// children list — the group adopts them (reparents out of the root)
		const halo = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 0, y: 0 }),
			radius: 42,
			fillColor: Color.hex("#fde68a"),
			opacity: 0.14,
		});
		const moon = yield* Scene.instantiate("Group", {
			position: S.vec3({ x: 174, y: 78 }),
			children: [
				halo,
				Scene.instantiate("Circle", {
					position: S.vec3({ x: 0, y: 0 }),
					radius: 29,
					fillColor: Color.hex("#fef3c7"),
				}),
				Scene.instantiate("Circle", {
					position: S.vec3({ x: -9, y: 7 }),
					radius: 4,
					fillColor: Color.hex("#e7d7a5"),
					opacity: 0.55,
				}),
			],
		});

		const leftWing = yield* Scene.instantiate("Ellipse", {
			position: S.vec3({ x: -8, y: 1 }),
			fillColor: Color.hex("#f9a8d4"),
			opacity: 0.85,
		});
		const rightWing = yield* Scene.instantiate("Ellipse", {
			position: S.vec3({ x: 8, y: 1 }),
			fillColor: Color.hex("#c4b5fd"),
			opacity: 0.85,
		});
		const moth = yield* Scene.instantiate("Group", {
			position: S.vec3({ x: -202, y: -74 }),
			opacity: 0,
			children: [
				leftWing,
				rightWing,
				Scene.instantiate("Ellipse", {
					position: S.vec3({ x: 0, y: -1 }),
					fillColor: Color.hex("#fbbf24"),
				}),
			],
		});

		const caption = yield* Scene.instantiate("Text", {
			position: S.vec3({ x: 0, y: 118 }),
			text: "ONE TINY MOTH. ONE VERY LARGE MOON.",
			fontSize: 14,
			fillColor: Color.hex("#f8fafc"),
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
						Motion.tweenTo({ radiusY: 2 }, "110 millis", "easeInOutCubic"),
						Motion.tweenTo({ radiusY: 7 }, "110 millis", "easeInOutCubic"),
					),
					rightWing.pipe(
						Motion.tweenTo({ radiusY: 2 }, "110 millis", "easeInOutCubic"),
						Motion.tweenTo({ radiusY: 7 }, "110 millis", "easeInOutCubic"),
					),
				]),
				Schedule.recurs(40),
			),
		);

		yield* moth.pipe(
			Motion.moveTo({ x: -124, y: -22 }, "450 millis", "easeOutCubic"),
			Motion.moveTo({ x: -38, y: 48 }, "520 millis", "easeInOutCubic"),
			Motion.moveTo({ x: 54, y: 24 }, "480 millis", "easeInOutCubic"),
			Motion.moveTo({ x: 100, y: 46 }, "260 millis", "easeInCubic"),
		);

		// The midpoint of every heroic journey: glass.
		yield* Scene.update(caption, (data) => ({ ...data, text: "bonk." }));
		yield* Scene.all([
			caption.pipe(Motion.fadeTo(1, "180 millis")),
			moth.pipe(
				Motion.moveTo({ x: 70, y: 18 }, "220 millis", "easeOutBack"),
				Motion.moveTo({ x: 32, y: -86 }, "650 millis", "easeInCubic"),
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
				Motion.moveTo({ x: 70, y: -32 }, "1.15 seconds", "easeInOutCubic"),
			),
			halo.pipe(
				Motion.tweenTo({ radius: 50 }, "1.15 seconds", "easeInOutCubic"),
			),
		]);
		yield* Motion.wait("350 millis");
		yield* caption.pipe(Motion.fadeTo(0, "250 millis"));

		// A recovery hop becomes a tiny orbit: gratitude, moth-style.
		yield* Physics.springTo(moth, { x: 36, y: -34 }, "jump");
		yield* Scene.all([
			moth.pipe(
				Motion.moveTo({ x: 42, y: 0 }, "280 millis", "easeInOutCubic"),
				Motion.moveTo({ x: 76, y: 12 }, "280 millis", "easeInOutCubic"),
				Motion.moveTo({ x: 108, y: -30 }, "280 millis", "easeInOutCubic"),
				Motion.moveTo({ x: 76, y: -66 }, "280 millis", "easeInOutCubic"),
				Motion.moveTo({ x: 48, y: -32 }, "280 millis", "easeInOutCubic"),
			),
			moon.pipe(
				Motion.moveTo({ y: -24 }, "700 millis", "easeInOutCubic"),
				Motion.moveTo({ y: -32 }, "700 millis", "easeInOutCubic"),
			),
		]);

		yield* Scene.update(caption, (data) => ({
			...data,
			text: finalCaption,
			position: S.vec3({ ...data.position, y: -88 }),
			fontSize: 18,
		}));
		yield* Scene.all([
			moon.pipe(
				Motion.moveTo({ x: 174, y: 78 }, "1.35 seconds", "easeInOutCubic"),
			),
			moth.pipe(
				Motion.moveTo({ x: 190, y: 94 }, "1.35 seconds", "easeInOutCubic"),
			),
			caption.pipe(Motion.fadeTo(1, "800 millis")),
		]);
		yield* Motion.wait("1 second");
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
