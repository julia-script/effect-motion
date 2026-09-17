import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

const ink = Color.hex("#e7edf5");
const widths = [0, 0.25, 0.5, 0.75, 1, 1.5, 2];
const label = (text: string, x: number, y: number) =>
	Scene.instantiate("Text", {
		text,
		position: Entity.vec3({ x, y }),
		fontSize: 23,
		textAnchor: "middle",
		fillColor: ink,
	});
const makeCase = (mode: "paint" | "depth", grouped: boolean) =>
	Scene.make(
		`subpixel strokes / ${grouped ? "paint groups in depth" : mode}`,
		function* () {
			yield* label(
				`FRACTIONAL STROKES / ${grouped ? "PAINT GROUPS IN DEPTH" : mode.toUpperCase()} / 1920 × 1080`,
				0,
				480,
			);
			yield* label(
				"Native DPR 1: one scene unit = one device pixel. Each cell: rectangle / diagonal / circle.",
				0,
				435,
			);
			const moving = yield* Scene.instantiate("Group", {});
			for (const [column, strokeWidth] of widths.entries()) {
				const x = -690 + column * 230;
				yield* label(`width ${strokeWidth}`, x, 375);
				for (const [row, offset] of [0, 0.25, 0.5, 0.75].entries()) {
					const y = 285 - row * 145;
					if (column === 0) yield* label(`Δ x,y ${offset}`, -890, y);
					const paint = {
						strokeWidth,
						strokeColor: ink,
						fillColor: Color.transparent,
					};
					const group = yield* Scene.instantiate("Group", {
						compositing: grouped ? "paint" : "inherit",
						position: Entity.vec3({ x: x + offset, y: y + offset }),
						children: [
							Scene.instantiate("Rect", {
								...paint,
								position: Entity.vec3({ x: -65 }),
								width: 48,
								height: 48,
							}),
							Scene.instantiate("Line", {
								...paint,
								start: Entity.vec3({ x: -22, y: -24 }),
								end: Entity.vec3({ x: 22, y: 24 }),
							}),
							Scene.instantiate("Circle", {
								...paint,
								position: Entity.vec3({ x: 65 }),
								radius: 24,
							}),
						],
					});
					yield* Scene.appendChild(moving, group);
				}
			}
			const sweep = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ y: -330 }),
				width: 160,
				height: 85,
				fillColor: Color.transparent,
				strokeColor: ink,
				strokeWidth: 0.25,
			});
			yield* label(
				"Width sweep 0.25 → 1.5. Matrix translates exactly (1, 1) over four seconds.",
				0,
				-420,
			);
			yield* Motion.wait("1 second");
			yield* Scene.all([
				Motion.moveTo(moving, { x: 1, y: 1 }, "4 seconds", "linear"),
				Motion.tweenTo(sweep, { strokeWidth: 1.5 }, "4 seconds", "linear"),
			]);
			yield* Motion.wait("1 second");
		},
		{
			width: 1920,
			height: 1080,
			compositing: mode,
			backgroundColor: Color.hex("#202b3b"),
		},
	);

export const scene = makeCase("paint", false);
export const depthScene = makeCase("depth", false);
export const groupedScene = makeCase("depth", true);
