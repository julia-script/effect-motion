import type * as Duration from "effect/Duration";
import * as Color from "effect-motion/Color";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

// A coordinate grid pushed through a nonlinear function: every grid line is
// a densely sampled Path, and one driven parameter interpolates each sample
// from its straight position to its warped one. The grid is what makes the
// function VISIBLE — you watch space itself bend.

type Pt = { x: number; y: number };

// stage 1: a gentle swell
const swell = (p: Pt): Pt => ({
	x: p.x + 110 * Math.sin(p.y / 170),
	y: p.y + 110 * Math.sin(p.x / 170),
});
// stage 2: a swirl that strengthens toward the center
const swirl = (p: Pt): Pt => {
	const r = Math.hypot(p.x, p.y);
	const a = Math.atan2(p.y, p.x) + 0.9 * Math.exp(-r / 600);
	return { x: r * Math.cos(a), y: r * Math.sin(a) };
};
const straight = (p: Pt): Pt => p;

const lerp = (a: Pt, b: Pt, t: number): Pt => ({
	x: a.x + (b.x - a.x) * t,
	y: a.y + (b.y - a.y) * t,
});

type Move = { _tag: "M"; x: number; y: number };
type LineTo = { _tag: "L"; x: number; y: number };
const toCommands = (pts: ReadonlyArray<Pt>): [Move, ...LineTo[]] => {
	const [head, ...rest] = pts;
	return [
		{ _tag: "M", x: head?.x ?? 0, y: head?.y ?? 0 },
		...rest.map((p): LineTo => ({ _tag: "L", x: p.x, y: p.y })),
	];
};

const noFill = Color.rgba(0, 0, 0, 0);
const STEP = 120; // grid spacing
const RES = 30; // sample spacing along each line

// the straight grid, as sample-point polylines
const gridLines: Array<{ base: Pt[]; axis: boolean }> = [];
for (let x = -960; x <= 960; x += STEP) {
	const base: Pt[] = [];
	for (let y = -540; y <= 540; y += RES) base.push({ x, y });
	gridLines.push({ base, axis: x === 0 });
}
for (let y = -540; y <= 540; y += STEP) {
	const base: Pt[] = [];
	for (let x = -960; x <= 960; x += RES) base.push({ x, y });
	gridLines.push({ base, axis: y === 0 });
}

export const scene = Scene.make(
	"grid warp",
	function* () {
		const lines = [];
		for (const { base, axis } of gridLines) {
			const path = yield* Scene.instantiate("Path", {
				fillColor: noFill,
				strokeColor: axis ? Color.hex("#7f5af0") : Color.hex("#544f80"),
				strokeWidth: axis ? 5 : 2,
				commands: toCommands(base),
			});
			lines.push({ path, base });
		}
		const placed = lines;

		// morph every line from one warp to the next, all in lockstep
		const stage = (
			from: (p: Pt) => Pt,
			to: (p: Pt) => Pt,
			duration: Duration.Input,
		) =>
			Scene.all(
				placed.map(({ path, base }) =>
					path.pipe(
						Motion.drive(duration, "easeInOutCubic", (t, data) => ({
							...data,
							commands: toCommands(base.map((p) => lerp(from(p), to(p), t))),
						})),
					),
				),
			);

		yield* Motion.wait("600 millis");
		yield* stage(straight, swell, "2500 millis");
		yield* Motion.wait("500 millis");
		yield* stage(swell, swirl, "2500 millis");
		yield* Motion.wait("500 millis");
		yield* stage(swirl, straight, "2 seconds");
		yield* Motion.wait("600 millis");
	},
	{ width: 1920, height: 1080, backgroundColor: Color.rgba(22, 22, 29) },
);
