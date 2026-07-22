import { Camera, Color, Entity as S, Scene } from "effect-motion";

// A 3D cubic Bézier drawn with Path. Native curve commands are a planned
// follow-up, and their chosen implementation is flattening — sampling the
// curve into straight spans. This example does that flattening in scene
// code today: every sample carries its own z, so the projected curve
// foreshortens point by point. A wireframe box (12 Line edges) frames the
// volume; the camera aims at its center with Camera.lookAt and turntables
// around it with Camera.orbitTo — the point of interest pins the aim, so
// there is no orientation math in the scene at all.

// control points, local to the path anchor — z spreads them through depth
const P0 = { x: 0, y: 0, z: 0 };
const P1 = { x: 0, y: -100, z: 100 };
const P2 = { x: 100, y: -200, z: -100 };
const P3 = { x: 10, y: -300, z: 0 };

const bezier = (t: number) => {
	const u = 1 - t;
	const w0 = u * u * u;
	const w1 = 3 * u * u * t;
	const w2 = 3 * u * t * t;
	const w3 = t * t * t;
	return {
		x: w0 * P0.x + w1 * P1.x + w2 * P2.x + w3 * P3.x,
		y: w0 * P0.y + w1 * P1.y + w2 * P2.y + w3 * P3.y,
		z: w0 * P0.z + w1 * P1.z + w2 * P2.z + w3 * P3.z,
	};
};

// 48 spans approximate the curve well below a pixel at this size
const SAMPLES = 48;
type Point3 = { x: number; y: number; z: number };
const curveCommands: [{ _tag: "M" } & Point3, ...({ _tag: "L" } & Point3)[]] = [
	{ _tag: "M", ...bezier(0) },
	...Array.from({ length: SAMPLES }, (_, i) => ({
		_tag: "L" as const,
		...bezier((i + 1) / SAMPLES),
	})),
];

const ANCHOR = { x: 0, y: 0 };
const noFill = Color.rgba(0, 0, 0, 0);

// the axes-box volume around the curve, in world coordinates
const BOX = {
	x0: 200,
	y0: 0,
	z0: 200,

	x1: -200,
	y1: -300,
	z1: -200,
};
// its 12 edges as Line endpoints: 4 along each axis
const boxEdges = (): Array<[Point3, Point3]> => {
	const { x0, x1, y0, y1, z0, z1 } = BOX;
	const edges: Array<[Point3, Point3]> = [];
	for (const y of [y0, y1]) {
		for (const z of [z0, z1]) {
			edges.push([
				{ x: x0, y, z },
				{ x: x1, y, z },
			]);
		}
	}
	for (const x of [x0, x1]) {
		for (const z of [z0, z1]) {
			edges.push([
				{ x, y: y0, z },
				{ x, y: y1, z },
			]);
		}
	}
	for (const x of [x0, x1]) {
		for (const y of [y0, y1]) {
			edges.push([
				{ x, y, z: z0 },
				{ x, y, z: z1 },
			]);
		}
	}
	return edges;
};

export const scene = Scene.make(
	"bezier-3d",
	function* () {
		// the wireframe box: each edge is a skeletal Line, both endpoints at
		// their own depth
		for (const [a, b] of boxEdges()) {
			// position stays at the origin; start and end carry the two corners
			// as offsets from it, so the edge spans a → b directly
			yield* Scene.instantiate("Line", {
				start: S.vec3({ x: a.x, y: a.y, z: a.z }),
				end: S.vec3({ x: b.x, y: b.y, z: b.z }),
				strokeColor: Color.hex("#3d4266"),
				strokeWidth: 2,
				opacity: 1,
			});
		}

		// the control polygon: straight rails between the control points
		yield* Scene.instantiate("Path", {
			...ANCHOR,
			fillColor: noFill,
			strokeColor: Color.tw("gray", "400"),
			strokeWidth: 2,
			commands: [
				{ _tag: "M", ...P0 },
				{ _tag: "L", ...P1 },
				{ _tag: "L", ...P2 },
				{ _tag: "L", ...P3 },
			],
		});

		// the curve itself — one Path, every sample at its own depth
		yield* Scene.instantiate("Path", {
			...ANCHOR,
			fillColor: noFill,
			strokeColor: Color.tw("pink", "500"),
			strokeWidth: 3,
			commands: curveCommands,
		});

		// markers + labels at the control points (world = anchor + local)
		const points = [P0, P1, P2, P3];
		for (const [i, p] of points.entries()) {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: ANCHOR.x + p.x, y: ANCHOR.y + p.y, z: p.z }),
				radius: 5,
				fillColor: Color.tw("violet", "500"),
			});
			yield* Scene.instantiate("Text", {
				position: S.vec3({
					x: ANCHOR.x + p.x + 12,
					y: ANCHOR.y + p.y - 8,
					z: p.z,
				}),
				text: `P${i}`,
				fontSize: 14,
				fillColor: Color.tw("gray", "400"),
			});
		}

		// aim at the box center, then turntable around it — the point of
		// interest keeps the camera locked on while only its position moves
		const cam = yield* Scene.camera;
		yield* Scene.update(cam, (props) => ({
			...props,
			position: S.vec3({ ...props.position, y: -1500 }),
			focalLength: 5000,
		}));
		yield* cam.pipe(
			Camera.lookAt({
				x: (BOX.x0 + BOX.x1) / 2,
				y: (BOX.y0 + BOX.y1) / 2,
				z: (BOX.z0 + BOX.z1) / 2,
			}),
			Camera.orbitTo(2, "5 seconds", "easeInOutCubic"),
			Camera.orbitTo(-2, "5 seconds", "easeInOutCubic"),
		);
	},
	{ backgroundColor: Color.tw("gray", "800") },
);
