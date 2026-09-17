import * as Effect from "effect/Effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

const white = Color.hex("#e7edf5");
const clear = Color.transparent;
const label = (text: string, x: number, y: number) =>
	Scene.instantiate("Text", {
		text,
		position: Entity.vec3({ x, y }),
		fontSize: 28,
		fillColor: white,
		textAnchor: "middle",
	});
const card = Effect.fnUntraced(function* (
	x: number,
	y: number,
	title: string,
	tilted = false,
) {
	const group = yield* Scene.instantiate("Group", {
		compositing: "paint",
		position: Entity.vec3({ x, y }),
		rotation: Entity.vec3({ y: tilted ? 0.4 : 0 }),
		children: [
			Scene.instantiate("Rect", {
				width: 380,
				height: 230,
				fillColor: Color.hex("#293b50"),
				strokeWidth: 8,
				strokeColor: white,
			}),
			Scene.instantiate("Circle", {
				position: Entity.vec3({ x: -45 }),
				radius: 75,
				fillColor: Color.hex("#33a6b8"),
				strokeColor: clear,
			}),
			Scene.instantiate("Circle", {
				position: Entity.vec3({ x: 45 }),
				radius: 75,
				fillColor: Color.hex("#f19155"),
				strokeColor: clear,
			}),
			label(title, 0, 70),
		],
	});
	return group;
});

export const scene = Scene.make(
	"paint order — surfaces in a depth scene",
	function* () {
		yield* label("PAINT ORDER / ALL PANEL CHILDREN AT Z = 0", 0, 440);
		const ordered = yield* card(-580, 200, "sibling reorder");
		const faded = yield* card(0, 200, "group opacity 0.5");
		yield* Scene.update(faded, (data) => ({ ...data, opacity: 0.5 }));
		yield* card(580, 200, "tilted paint surface", true);
		// A farther object is visible through the outline's transparent center.
		yield* Scene.instantiate("Rect", {
			position: Entity.vec3({ x: -580, y: -210, z: -30 }),
			width: 240,
			height: 130,
			fillColor: Color.hex("#33a6b8"),
			strokeColor: clear,
		});
		yield* Scene.instantiate("Group", {
			compositing: "paint",
			position: Entity.vec3({ x: -580, y: -210 }),
			children: [
				Scene.instantiate("Rect", {
					width: 330,
					height: 190,
					fillColor: clear,
					strokeColor: white,
					strokeWidth: 14,
				}),
			],
		});
		yield* label("transparent hole", -580, -370);
		// Reverse authoring order: the nearer orange object must still win.
		for (const [x, reverse] of [
			[0, false],
			[580, true],
		] as const) {
			for (const near of reverse ? [true, false] : [false, true]) {
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({
						x: x + (near ? 30 : -30),
						y: -210,
						z: near ? 30 : -30,
					}),
					width: 180,
					height: 150,
					fillColor: Color.hex(near ? "#f19155" : "#33a6b8"),
					strokeColor: clear,
				});
			}
			yield* label(
				reverse ? "depth / near authored first" : "depth / near authored last",
				x,
				-370,
			);
		}
		yield* Motion.wait("2 seconds");
		yield* Scene.update(ordered, (data) => {
			const [background, a, b, text] = data.children;
			return background !== undefined &&
				a !== undefined &&
				b !== undefined &&
				text !== undefined
				? { ...data, children: [background, b, a, text] }
				: data;
		});
		yield* Motion.wait("2 seconds");
	},
	{
		width: 1920,
		height: 1080,
		compositing: "depth",
		backgroundColor: Color.hex("#151b26"),
	},
);
