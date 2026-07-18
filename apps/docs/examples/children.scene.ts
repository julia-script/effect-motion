import { Color, Motion, Scene, Shapes } from "effect-motion";

// A Group's `children` list is polymorphic: a bare string becomes a Text, a
// not-yet-yielded `instantiate` is resolved internally, and an already-created
// instance contributes its id. The children are born under the group and move
// with it — one motion carries the whole subtree.
export const scene = Scene.make(function* () {
	// an instance created up front, to hand into the children list by value
	const badge = yield* Scene.instantiate(Shapes.Circle, {
		x: 0,
		y: -34,
		radius: 10,
		fill: Color.hex("#2cb67d"),
	});

	const card = yield* Scene.instantiate(Shapes.Group, {
		x: 120,
		y: 150,
		children: [
			// a bare string → a Text
			"effect-motion",
			// a nested instantiate, NOT yielded — resolved by the children list
			Scene.instantiate(Shapes.Text, {
				text: "composed from children",
				y: 22,
				fontSize: 11,
				fill: Color.hex("#a1a1aa"),
			}),
			// an instance passed by value → reparented into this group
			badge,
		],
	});

	// moving the group carries every child with it
	yield* card.pipe(
		Motion.moveTo({ x: 320 }, "1 second", "easeInOutCubic"),
		Motion.moveTo({ x: 120 }, "1 second", "easeInOutCubic"),
	);
});
