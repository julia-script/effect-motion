import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

const ink = Color.hex("#e7edf5");
const label = (text: string, x: number, y: number) =>
	Scene.instantiate("Text", {
		text,
		position: Entity.vec3({ x, y }),
		fontSize: 23,
		textAnchor: "middle",
		fillColor: ink,
	});
export const scene = Scene.make(
	"stroke union — one paint versus separate entities",
	function* () {
		yield* label("STROKE COVERAGE / JOINS, CROSSINGS AND RETRACING", 0, 480);
		const names = [
			"triangle",
			"filled rectangle",
			"self crossing",
			"two subpaths",
			"retraced",
			"two entities",
		];
		for (const [row, name] of names.entries())
			yield* label(name, -810, 325 - row * 130);
		for (const [column, alpha] of [0, 0.25, 0.5, 0.75, 1].entries()) {
			const x = -520 + column * 290;
			yield* label(`alpha ${alpha}`, x, 415);
			const paint = {
				strokeColor: Color.rgba(231, 237, 245, alpha),
				strokeWidth: 18,
				fillColor: Color.transparent,
			};
			for (let row = 0; row < 6; row++) {
				const y = 335 - row * 130;
				if (row === 1) {
					yield* Scene.instantiate("Rect", {
						...paint,
						position: Entity.vec3({ x, y }),
						width: 110,
						height: 75,
						fillColor: Color.hex("#456889"),
					});
					continue;
				}
				if (row === 5) {
					for (const sign of [-1, 1])
						yield* Scene.instantiate("Line", {
							...paint,
							position: Entity.vec3({ x, y }),
							start: Entity.vec3({ x: -50, y: -35 * sign }),
							end: Entity.vec3({ x: 50, y: 35 * sign }),
						});
					continue;
				}
				const commands: [Entity.PathCommand, ...Array<Entity.PathCommand>] =
					row === 0
						? [
								{ _tag: "M", x: 0, y: 40 },
								{ _tag: "L", x: 50, y: -35 },
								{ _tag: "L", x: -50, y: -35 },
								{ _tag: "Z" },
							]
						: row === 2
							? [
									{ _tag: "M", x: -50, y: -35 },
									{ _tag: "L", x: 50, y: 35 },
									{ _tag: "L", x: -50, y: 35 },
									{ _tag: "L", x: 50, y: -35 },
									{ _tag: "Z" },
								]
							: row === 3
								? [
										{ _tag: "M", x: -50, y: -35 },
										{ _tag: "L", x: 50, y: 35 },
										{ _tag: "M", x: -50, y: 35 },
										{ _tag: "L", x: 50, y: -35 },
									]
								: [
										{ _tag: "M", x: -50, y: 0 },
										{ _tag: "L", x: 50, y: 0 },
										{ _tag: "L", x: -50, y: 0 },
									];
				yield* Scene.instantiate("Path", {
					...paint,
					position: Entity.vec3({ x, y }),
					commands,
				});
			}
		}
		yield* Motion.wait("2 seconds");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.hex("#202b3b") },
);
