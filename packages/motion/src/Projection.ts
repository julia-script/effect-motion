/**
 * Perspective projection — pure math shared by every sink, usable without
 * the Effect runtime. No wall-clock, no RNG: projecting the same camera and
 * point twice is bit-for-bit identical, which is what keeps 2.5D scenes
 * deterministic.
 *
 * The model is the After Effects one: a camera with a world position, Euler
 * orientation, and a focal length, looking down world -z at rest. World
 * points are transformed into the camera's frame (the view transform, which
 * is the inverse of the camera's own world transform), then divided by their
 * depth in front of the camera to land on screen.
 *
 * Identity invariant: the default camera (see `defaultFocalLength` and
 * `defaultCameraZ`) projects a world point at `z = 0` to screen `(x, y)` at
 * scale 1 — so a scene that never touches depth renders exactly as the old
 * plain-2D pipeline did. That falls out of placing the resting camera a
 * focal-length back on +z and dividing by focal length at the z=0 plane —
 * and holds for ANY focal length, which is why the default can be
 * width-relative without breaking plain-2D scenes.
 */

export interface Vec3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export interface Vec2 {
	readonly x: number;
	readonly y: number;
}

/** The camera view, as it arrives on the frame from the runner. */
export interface CameraView {
	readonly x: number;
	readonly y: number;
	readonly z: number;
	readonly rotX: number;
	readonly rotY: number;
	readonly rotZ: number;
	readonly focalLength: number;
}

/**
 * A projected point: screen position, the view-space depth used as the
 * painter's-sort key (larger = farther from the camera), and the uniform
 * `scale` a billboard at this point receives (focalLength / depth).
 */
export interface Projected {
	readonly x: number;
	readonly y: number;
	readonly depth: number;
	readonly scale: number;
}

/**
 * Default focal length (px) for a comp of the given width — After Effects'
 * default lens: 50mm on 36mm-wide film, so `zoom = width × 50/36`. Width-
 * relative so perspective strength (how much a given z moves/scales a shape)
 * reads the same at every output resolution.
 */
export const defaultFocalLength = (width: number): number => (width * 50) / 36;

/**
 * The resting camera sits this far back on +z, looking toward -z, so that
 * the `z = 0` plane is exactly `focalLength` in front of it — the identity
 * invariant. A camera authored without a `z` uses this.
 */
export const defaultCameraZ = (focalLength: number): number => focalLength;

// ── Euler rotation ──────────────────────────────────────────────────────
// Rotate a vector by the camera's inverse orientation (world → view). The
// camera's own rotation is applied X→Y→Z; the view transform is its inverse,
// so we negate the angles and apply Z→Y→X. Small hand-rolled rotations beat
// a general matrix lib here (ponytail: only these three axes are ever used).

const rotateInverse = (v: Vec3, rx: number, ry: number, rz: number): Vec3 => {
	let { x, y, z } = v;
	// inverse of Rz
	if (rz !== 0) {
		const c = Math.cos(-rz);
		const s = Math.sin(-rz);
		const nx = x * c - y * s;
		const ny = x * s + y * c;
		x = nx;
		y = ny;
	}
	// inverse of Ry
	if (ry !== 0) {
		const c = Math.cos(-ry);
		const s = Math.sin(-ry);
		const nx = x * c + z * s;
		const nz = -x * s + z * c;
		x = nx;
		z = nz;
	}
	// inverse of Rx
	if (rx !== 0) {
		const c = Math.cos(-rx);
		const s = Math.sin(-rx);
		const ny = y * c - z * s;
		const nz = y * s + z * c;
		y = ny;
		z = nz;
	}
	return { x, y, z };
};

/**
 * Rotate a vector by an Euler orientation (X→Y→Z), the forward transform
 * used to orient a shape's local plane into world space. Mirror of
 * `rotateInverse`.
 */
const rotate = (v: Vec3, rx: number, ry: number, rz: number): Vec3 => {
	let { x, y, z } = v;
	if (rx !== 0) {
		const c = Math.cos(rx);
		const s = Math.sin(rx);
		const ny = y * c - z * s;
		const nz = y * s + z * c;
		y = ny;
		z = nz;
	}
	if (ry !== 0) {
		const c = Math.cos(ry);
		const s = Math.sin(ry);
		const nx = x * c + z * s;
		const nz = -x * s + z * c;
		x = nx;
		z = nz;
	}
	if (rz !== 0) {
		const c = Math.cos(rz);
		const s = Math.sin(rz);
		const nx = x * c - y * s;
		const ny = x * s + y * c;
		x = nx;
		y = ny;
	}
	return { x, y, z };
};

/**
 * The four world-space corners of a flat rectangular plane. The rect spans
 * local `[x, x+width] × [y, y+height]` on the z=0 plane; each corner is
 * rotated about the rect's local origin `(x, y)` by the Euler orientation,
 * then translated to `world` (the plane's composed world anchor minus its own
 * local x/y, so rotation pivots on the anchor). Winding: TL, TR, BR, BL.
 */
export const planeCorners = (
	rect: { x: number; y: number; width: number; height: number },
	orientation: { rotX: number; rotY: number; rotZ: number },
	world: Vec3,
): [Vec3, Vec3, Vec3, Vec3] => {
	const { rotX, rotY, rotZ } = orientation;
	// local corners relative to the rect's own origin (the rotation pivot)
	const local: [Vec2, Vec2, Vec2, Vec2] = [
		{ x: 0, y: 0 },
		{ x: rect.width, y: 0 },
		{ x: rect.width, y: rect.height },
		{ x: 0, y: rect.height },
	];
	const place = (c: Vec2): Vec3 => {
		const r = rotate({ x: c.x, y: c.y, z: 0 }, rotX, rotY, rotZ);
		return { x: world.x + r.x, y: world.y + r.y, z: world.z + r.z };
	};
	return [place(local[0]), place(local[1]), place(local[2]), place(local[3])];
};

/**
 * A world point in the camera's frame, measured relative to `origin` (the
 * viewport center). The camera's `x`/`y` are a pan *from* the origin, so a
 * resting camera (pan 0) keeps world-x/y = screen-x/y at unit scale. `+z` in
 * the result is in front of the camera: the camera looks down world -z, so a
 * resting camera at z=focalLength sees the z=0 plane at view-z = focalLength.
 */
export const toView = (camera: CameraView, p: Vec3, origin: Vec2): Vec3 => {
	const translated: Vec3 = {
		x: p.x - origin.x - camera.x,
		y: p.y - origin.y - camera.y,
		z: camera.z - p.z, // flip so in-front is +z (camera looks toward -world-z)
	};
	return rotateInverse(translated, camera.rotX, camera.rotY, camera.rotZ);
};

/**
 * Project a world point to screen. `origin` is the screen point the camera's
 * optical axis passes through — the viewport center — so pan/zoom read as
 * "into the middle of the shot", while a resting camera reproduces plain-2D
 * placement. A point at or behind the camera (view-z <= 0) has no valid
 * projection; `depth` is still returned for sorting, `scale` clamps to 0.
 */
export const project = (
	camera: CameraView,
	p: Vec3,
	origin: Vec2,
): Projected => {
	const v = toView(camera, p, origin);
	const depth = v.z;
	const scale = depth > 0 ? camera.focalLength / depth : 0;
	return {
		x: origin.x + v.x * scale,
		y: origin.y + v.y * scale,
		depth,
		scale,
	};
};

/**
 * The affine placement for a camera-facing billboard whose local origin is
 * `anchor`: translate the anchor's projected screen point and uniformly
 * scale by its perspective scale. Returned as SVG matrix components
 * `(a b c d e f)` — a and d carry the scale, e/f the translation — so a shape
 * authored in local space lands correctly without knowing about the camera.
 */
export interface Affine {
	readonly a: number;
	readonly b: number;
	readonly c: number;
	readonly d: number;
	readonly e: number;
	readonly f: number;
}

export const billboardAffine = (proj: Projected, anchor: Vec2): Affine => ({
	a: proj.scale,
	b: 0,
	c: 0,
	d: proj.scale,
	// place the anchor's local coords at the projected screen point
	e: proj.x - anchor.x * proj.scale,
	f: proj.y - anchor.y * proj.scale,
});

/**
 * View-space depth (px) of the near clip plane. A tilted plane can be
 * PARTIALLY behind the camera — projecting a corner at depth <= 0 is
 * meaningless (the old code pinned it to the viewport center, folding the
 * polygon), so the polygon is clipped against this plane first. 1px keeps
 * the worst-case projected scale bounded at `focalLength` per unit.
 */
const NEAR = 1;

/**
 * Project the world-space corners of a tilted plane to a screen polygon.
 * The polygon is clipped against the near plane in view space
 * (Sutherland–Hodgman, winding preserved) before the per-vertex perspective
 * divide, so a plane crossing the camera renders its visible part instead
 * of folding — a quad straddling the plane yields up to 5 vertices; a plane
 * fully behind yields none (cull). Fully in front, this is plain per-corner
 * projection: a receding plane is a true perspective trapezoid.
 */
export const projectPlane = (
	camera: CameraView,
	corners: ReadonlyArray<Vec3>,
	origin: Vec2,
): Array<Vec2> => {
	const view = corners.map((c) => toView(camera, c, origin));
	const clipped: Vec3[] = [];
	for (let i = 0; i < view.length; i++) {
		// biome-ignore lint/style/noNonNullAssertion: i and (i+1)%length are in bounds
		const a = view[i]!;
		// biome-ignore lint/style/noNonNullAssertion: see above
		const b = view[(i + 1) % view.length]!;
		const aIn = a.z >= NEAR;
		if (aIn) {
			clipped.push(a);
		}
		if (aIn !== b.z >= NEAR) {
			const t = (NEAR - a.z) / (b.z - a.z);
			clipped.push({
				x: a.x + (b.x - a.x) * t,
				y: a.y + (b.y - a.y) * t,
				z: NEAR,
			});
		}
	}
	return clipped.map((v) => {
		const scale = camera.focalLength / v.z;
		return { x: origin.x + v.x * scale, y: origin.y + v.y * scale };
	});
};

/**
 * The view-space depth of a world point — the painter's-sort key alone.
 * With no camera rotation this is `camera.z - p.z`; rotation tilts the
 * depth axis, so the full view transform is used. Origin only shifts x/y,
 * never depth, so a zero origin suffices.
 */
export const depthOf = (camera: CameraView, p: Vec3): number =>
	toView(camera, p, { x: 0, y: 0 }).z;
