import { Color, Motion, Physics, Entity as S, Scene } from "effect-motion";

// children live in the group's local coordinates: one motion moves them all.
// structure is defined by the children list, not a parent argument.
export const scene = Scene.make(
	function* () {
		const duo = yield* Scene.instantiate("Group", {
			position: S.vec3({ x: 70, y: 200 }),
			children: [
				Scene.instantiate("Circle", {
					position: S.vec3({ x: 0, y: 0 }),
					radius: 14,
					fillColor: Color.hex("#e53170"),
				}),
				Scene.instantiate("Rect", {
					position: S.vec3({ x: 20, y: -16 }),
					width: 28,
					height: 28,
					fillColor: Color.hex("#a786df"),
				}),
			],
		});

		// every animator accepts the previous step's result, so motions chain
		yield* duo.pipe(
			Motion.moveTo({ x: 380 }, "1.5 seconds", "easeInOutCubic"),
			Physics.springTo({ y: 80 }, "jump"),
			Motion.moveTo({ x: 70 }, "1.5 seconds", "easeInOutCubic"),
			Motion.wait("500 millis"),
			// traits cascade too: fade the whole group at once
			Motion.fadeTo(0.15, "1 second"),
		);
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
