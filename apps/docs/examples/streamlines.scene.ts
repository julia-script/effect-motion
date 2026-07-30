import { Random } from "effect";
import * as Color from "effect-motion/Color";
import * as Entity from "effect-motion/Entity";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// A vector field made visible: ninety short Lines, each advected by the
// field one frame at a time. Their seed positions come from the scene's
// seeded Random, and the integration in Motion.drive is pure — so this
// "chaotic" flow replays identically on every run. Determinism is the
// point, not an obstacle.

// a swirl around the center, faster near it, with a gentle outward drift
const field = (x: number, y: number) => {
	const r = Math.hypot(x, y) + 120;
	const swirlSpeed = 90_000 / r;
	return {
		x: (-y / r) * swirlSpeed + (x / r) * 14,
		y: (x / r) * swirlSpeed + (y / r) * 14,
	};
};

const N = 90;
const DT = 1 / 60;
const TAIL = 0.22; // tail length, in seconds-of-travel

export const scene = Scene.make(
	"streamlines",
	function* () {
		const drives = [];
		for (let i = 0; i < N; i++) {
			const x = yield* Random.nextBetween(-900, 900);
			const y = yield* Random.nextBetween(-500, 500);
			const hue = yield* Random.nextBetween(0, 1);
			const v = field(x, y);
			const line = yield* Scene.instantiate("Line", {
				position: Entity.vec3({ x, y }),
				end: Entity.vec3({ x: -v.x * TAIL, y: -v.y * TAIL }),
				strokeColor: hue < 0.5 ? Color.hex("#7f5af0") : Color.hex("#2cb67d"),
				strokeWidth: 4,
				opacity: 0.75,
			});
			// advect: step the position along the field each frame; the tail
			// trails opposite the local velocity
			drives.push(
				line.pipe(
					Motion.drive("8 seconds", "linear", (_t, data) => {
						const p = data.position;
						const vel = field(p.x, p.y);
						return {
							...data,
							position: Entity.vec3({
								x: p.x + vel.x * DT,
								y: p.y + vel.y * DT,
							}),
							end: Entity.vec3({ x: -vel.x * TAIL, y: -vel.y * TAIL }),
						};
					}),
				),
			);
		}
		yield* Scene.all(drives);
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
