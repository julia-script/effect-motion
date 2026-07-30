import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// One tree of instances, structured by children. A Group's children list is
// polymorphic — a bare string becomes a Text, a not-yet-yielded instantiate
// resolves in place, an existing instance is adopted — and the group's motion
// carries the whole subtree.
export const scene = Scene.make(
	"instance tree",
	function* () {
		// created up front, handed into the children list by value
		const badge = yield* Scene.instantiate("Circle", {
			position: Entity.vec3({ y: 120 }),
			radius: 36,
			fillColor: Color.hex("#2cb67d"),
		});

		const card = yield* Scene.instantiate("Group", {
			position: Entity.vec3({ x: -450 }),
			children: [
				// a bare string → a Text
				"effect-motion",
				// a nested instantiate, NOT yielded — the children list resolves it
				Scene.instantiate("Text", {
					position: Entity.vec3({ y: -80 }),
					text: "one tree, structured by children",
					fontSize: 40,
					fillColor: Color.hex("#94a3b8"),
					textAnchor: "middle",
					baseline: "middle",
				}),
				// an existing instance → reparented into this group
				badge,
			],
		});

		// one motion moves the whole subtree
		yield* card.pipe(
			Motion.moveTo({ x: 250 }, "1200 millis", "easeInOutCubic"),
		);

		// instance data is live: update rewrites it between frames
		yield* Scene.update(badge, (d) => ({
			...d,
			fillColor: Color.hex("#ff8906"),
		}));
		yield* Motion.wait("400 millis");

		// built-in props every entity carries; visible skips rendering
		yield* Scene.update(badge, (d) => ({ ...d, visible: false }));
		yield* Motion.wait("500 millis");
		yield* Scene.update(badge, (d) => ({ ...d, visible: true }));
		yield* Motion.wait("800 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
