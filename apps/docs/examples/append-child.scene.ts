import { Color, Motion, Entity as S, Scene } from "effect-motion";

// Instances are born under the ambient parent (the root). `Scene.appendChild`
// moves one into a group after the fact — detaching it from its current parent
// first, so it is never referenced twice. Once adopted, it inherits the group's
// transform: the same tween now moves in the group's local space.
export const scene = Scene.make(
	function* () {
		// a group that will act as a moving platform
		const platform = yield* Scene.instantiate("Group", {
			position: S.vec3({ x: 60, y: 150 }),
		});

		// a dot born at the root (not yet in the group)
		const dot = yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 0, y: 0 }),
			radius: 14,
			fillColor: Color.hex("#7f5af0"),
		});

		// slide it in on its own, at the root level
		yield* Motion.moveTo(dot, { x: 60, y: 150 }, "700 millis", "easeOutCubic");

		// adopt it into the platform — now its coordinates are the group's local space
		yield* Scene.appendChild(platform, dot);
		yield* Scene.update(dot, (d) => ({
			...d,
			position: S.vec3({ x: 0, y: 0 }),
		}));

		// moving the platform now carries the dot with it
		yield* platform.pipe(
			Motion.moveTo({ x: 380 }, "1 second", "easeInOutCubic"),
			Motion.moveTo({ x: 60 }, "1 second", "easeInOutCubic"),
		);
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
