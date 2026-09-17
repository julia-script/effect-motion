import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

const ink = Color.hex("#e7edf5");
const darkInk = Color.hex("#26364b");
const noFill = Color.rgba(0, 0, 0, 0);

const label = Effect.fnUntraced(function* (
	text: string,
	x: number,
	y: number,
	fillColor = ink,
) {
	yield* Scene.instantiate("Text", {
		text,
		position: Entity.vec3({ x, y }),
		fontSize: 22,
		textAnchor: "middle",
		fillColor,
	});
});

/** Six isolated stress cases; all motion is deterministic and scrub-able. */
export const scene = Scene.make(
	"border quality — joins, alpha and motion",
	function* () {
		const camera = yield* Scene.instantiate("Camera", {
			position: Entity.vec3({ z: 1000 }),
			focalLength: 1000,
		});
		yield* Scene.setCamera(camera);
		yield* label("BORDER QUALITY / STRESS CASES", 0, 430);
		// Paint order keeps all panels behind the later examples at z=0.
		for (const y of [220, -190]) {
			for (const x of [-470, 0, 470]) {
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({ x, y }),
					width: 440,
					height: 360,
					fillColor: x === 0 ? Color.hex("#eef1f5") : Color.hex("#202b3b"),
					strokeColor: noFill,
				});
			}
		}

		yield* label("01 / ALPHA & FILL", -470, 350);
		for (const [index, alpha] of [1, 0.5].entries()) {
			const x = -575 + index * 210;
			yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x, y: 225 }),
				width: 120,
				height: 100,
				fillColor: Color.hex("#456889"),
				strokeColor: Color.rgba(231, 237, 245, alpha),
				strokeWidth: 24,
			});
			yield* label(`stroke alpha ${alpha}`, x, 115);
		}

		yield* label("02 / ACUTE JOINS & CLOSURE", 0, 350, darkInk);
		for (const [index, alpha] of [1, 0.5].entries()) {
			const x = -105 + index * 210;
			yield* Scene.instantiate("Path", {
				position: Entity.vec3({ x, y: 220 }),
				fillColor: noFill,
				strokeColor: Color.rgba(38, 54, 75, alpha),
				strokeWidth: 20,
				commands: [
					{ _tag: "M", x: 0, y: 65 },
					{ _tag: "L", x: 55, y: -45 },
					{ _tag: "L", x: -55, y: -45 },
					{ _tag: "Z" },
				],
			});
			yield* label(`stroke alpha ${alpha}`, x, 115, darkInk);
		}

		yield* label("03 / SMALL RADII, 8-UNIT STROKE", 470, 350);
		for (const [index, radius] of [4, 12, 40].entries()) {
			const x = 340 + index * 130;
			yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x, y: 220 }),
				radius,
				fillColor: noFill,
				strokeColor: ink,
				strokeWidth: 8,
			});
			yield* label(`r = ${radius}`, x, 115);
		}

		yield* label("04 / SUBPIXEL MOTION, WIDTH 1", -470, -60);
		yield* label("05 / ROTATION, WIDTH 4", 0, -60, darkInk);
		yield* label("06 / PERSPECTIVE TILT, WIDTH 8", 470, -60);
		const motions = [];
		for (const [column, center] of [-470, 0, 470].entries()) {
			for (const [index, name] of ["reference", "animated"].entries()) {
				const x = center - 105 + index * 210;
				const rect = yield* Scene.instantiate("Rect", {
					position: Entity.vec3({ x, y: -185 }),
					width: 110,
					height: 110,
					fillColor: noFill,
					strokeColor: column === 1 ? darkInk : ink,
					strokeWidth: column === 0 ? 1 : column === 1 ? 4 : 8,
				});
				yield* label(name, x, -300, column === 1 ? darkInk : ink);
				if (index === 1) {
					motions.push(
						column === 0
							? Motion.moveTo(
									rect,
									{ x: x + 1, y: -184 },
									"4 seconds",
									"linear",
								)
							: Motion.drive(rect, "4 seconds", "linear", (t, data) => ({
									...data,
									rotation: Entity.vec3(
										column === 1
											? { z: (t * Math.PI) / 4 }
											: { y: (t * Math.PI) / 3 },
									),
								})),
					);
				}
			}
		}
		yield* label(
			"0–2 s: hold    /    2–6 s: move 1 unit, rotate 45°, tilt 60°    /    6–8 s: hold",
			0,
			-390,
		);
		yield* Motion.wait("2 seconds");
		yield* Scene.all(motions);
		yield* Motion.wait("2 seconds");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#151b26") },
);
