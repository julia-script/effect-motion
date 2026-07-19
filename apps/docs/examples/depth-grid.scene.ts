import { Camera, Color, Motion, Scene, Shapes } from "effect-motion";

// The synthwave floor: cross lines sit at one depth each (constant z),
// while the rails receding to the horizon span depth — start and end
// point carry independent z via z2. With aperture > 0 the focus plane
// stays sharp and the horizon melts into blur.
export const scene = Scene.make(
	function* () {
		const floorY = 235;
		const horizon = -2200;

		// rails: same world x/y at both ends, far end deep — pure z2. The
		// stroke is thick because a segment's width scales by its MIDPOINT
		// perspective scale (one width per line — see the camera docs).
		for (let x = -1750; x <= 1750; x += 250) {
			yield* Scene.instantiate(Shapes.Line, {
				x,
				y: floorY,
				z: 300,
				x2: x,
				y2: floorY,
				z2: horizon,
				stroke: Color.hex("#ff2975"),
				strokeWidth: 5,
			});
		}
		// cross lines: each fully at one depth, marching toward the horizon
		for (let z = 300; z >= horizon; z -= 200) {
			yield* Scene.instantiate(Shapes.Line, {
				x: -1750,
				y: floorY,
				z,
				x2: 1750,
				y2: floorY,
				z2: z,
				stroke: Color.hex("#f9c80e"),
				strokeWidth: 2,
				opacity: 0.8,
			});
		}

		const camera = yield* Scene.instantiate(Camera.Camera, { aperture: 2.5 });
		yield* Scene.setCamera(camera);

		// focus on the middle of the grid: a rail blurs by its MIDPOINT depth
		// (one blur per line), so putting the focus plane there keeps the
		// rails crisp while the cross lines — one depth each — grade from
		// foreground bokeh through sharp into the horizon melt
		const focus = (yield* Scene.data(camera)).focusDistance ?? 0;
		yield* Scene.update(camera, (data) => ({
			...data,
			focusDistance: focus + 950,
		}));

		// slow dolly into the grid and back — the rails' perspective and the
		// blur bands shift with the camera. The resting z comes from the
		// identity camera (the Runner fills it; only it knows the width).
		const restZ = Camera.identity((yield* Scene.comp()).width).z;
		yield* Motion.tweenTo(
			camera,
			{ z: restZ - 500 },
			"3 seconds",
			"easeInOutSine",
		);
		yield* Motion.tweenTo(camera, { z: restZ }, "3 seconds", "easeInOutSine");
	},
	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
);
