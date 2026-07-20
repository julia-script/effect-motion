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
	/**
	 * view-space distance to the sharp plane (depth of field). Runner-filled
	 * to the resting camera distance, so the z=0 plane is in focus untouched.
	 */
	readonly focusDistance: number;
	/** depth-of-field blur strength; 0 (the default) = pinhole, DoF off */
	readonly aperture: number;
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

/** Optional point of interest carried beside a camera view (world coords). */
export interface PointOfInterest {
	readonly poiX?: number;
	readonly poiY?: number;
	readonly poiZ?: number;
}

/**
 * The auto-orient Euler angles (yaw + pitch, no roll) aiming a camera at
 * `poi` from its WORLD position (viewport-center pan already composed in —
 * see `resolveCamera`). The view transform flips z before rotating
 * (in-front is +z), which inverts rotation handedness vs. world space;
 * that subtlety is handled here, exactly once, pinned by tests that
 * project the POI and assert it lands on the viewport center.
 */
export const lookAtOrientation = (
	position: Vec3,
	poi: Vec3,
): { rotX: number; rotY: number } => {
	const dx = poi.x - position.x;
	const dy = poi.y - position.y;
	const dz = position.z - poi.z; // flipped: in-front is +z
	const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
	if (len === 0) {
		return { rotX: 0, rotY: 0 };
	}
	return { rotY: Math.atan2(dx, dz), rotX: -Math.asin(dy / len) };
};

/**
 * The effective camera view: when a point of interest is set, auto-orient
 * toward it with the explicit Euler composing AFTER the aim — the After
 * Effects two-node rule. "After" means the user's rotation applies in the
 * camera's own frame (so a lone `rotZ` rolls about the view axis and the
 * POI stays centered); the exact composed rotation is extracted back to
 * the fixed Rz·Ry·Rx Euler convention the view transform consumes.
 * Camera `x`/`y` are pan-from-viewport-center, so the world position
 * composes `origin` in before aiming. Absent POI is a pass-through
 * (one-node camera, unchanged); a partial POI is a loud defect. The
 * user's rotation fields are never written back — derivation happens
 * here, at view-assembly time.
 */
export const resolveCamera = (
	camera: CameraView & PointOfInterest,
	origin: Vec2,
): CameraView => {
	const { poiX, poiY, poiZ } = camera;
	const present = [poiX, poiY, poiZ].filter((v) => v !== undefined).length;
	if (present === 0) {
		return camera;
	}
	if (present !== 3) {
		throw new Error(
			"Camera: a point of interest requires all of poiX, poiY, poiZ — got a partial POI",
		);
	}
	const world: Vec3 = {
		x: origin.x + camera.x,
		y: origin.y + camera.y,
		z: camera.z,
	};
	const aim = lookAtOrientation(world, {
		x: poiX as number,
		y: poiY as number,
		z: poiZ as number,
	});
	// aim only: return the derived angles exactly (no fp noise from the
	// compose/extract round-trip in the common case)
	if (camera.rotX === 0 && camera.rotY === 0 && camera.rotZ === 0) {
		return { ...camera, rotX: aim.rotX, rotY: aim.rotY };
	}
	// exact composition M = Aim · UserEuler: the user rotation applied in
	// camera-local space, then aimed — additive angles would roll about the
	// WORLD axis and drag the POI off-center. Build M's columns with the
	// same rotate() the pipeline uses, then extract ZYX Euler angles
	// (rotate ≡ Rz·Ry·Rx, canonical right-handed forms).
	const compose = (v: Vec3): Vec3 =>
		rotate(
			rotate(v, camera.rotX, camera.rotY, camera.rotZ),
			aim.rotX,
			aim.rotY,
			0,
		);
	const c0 = compose({ x: 1, y: 0, z: 0 });
	const c1 = compose({ x: 0, y: 1, z: 0 });
	const c2 = compose({ x: 0, y: 0, z: 1 });
	const rotY = -Math.asin(Math.max(-1, Math.min(1, c0.z)));
	// gimbal (camera pitched straight up/down): yaw and roll degenerate —
	// pick roll = 0 and fold everything into pitch
	const gimbal = Math.abs(c0.z) > 0.999999;
	const rotX = gimbal ? Math.atan2(-c1.x, c1.y) : Math.atan2(c1.z, c2.z);
	const rotZ = gimbal ? 0 : Math.atan2(c0.y, c0.x);
	return { ...camera, rotX, rotY, rotZ };
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
 * The view-space depth of a world point — the painter's-sort key alone.
 * With no camera rotation this is `camera.z - p.z`; rotation tilts the
 * depth axis, so the full view transform is used. Origin only shifts x/y,
 * never depth, so a zero origin suffices.
 */
export const depthOf = (camera: CameraView, p: Vec3): number =>
	toView(camera, p, { x: 0, y: 0 }).z;
