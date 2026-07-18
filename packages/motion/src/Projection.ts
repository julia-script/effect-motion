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

/** A projected segment: exact screen endpoints plus its single sort key. */
export interface ProjectedSegment {
	readonly a: Vec2;
	readonly b: Vec2;
	/** midpoint view-space depth of the visible (clipped) segment */
	readonly depth: number;
	/** perspective scale at that midpoint (focalLength / depth) */
	readonly scale: number;
}

/**
 * Project a world-space segment (a skeletal shape's two endpoints) to
 * screen. Both endpoints go to view space, are clipped against the near
 * plane (lerp to z = NEAR — the 1D case of projectPlane's polygon clip),
 * and are projected individually, so a line spanning depth foreshortens
 * per endpoint. Returns `undefined` when the segment lies entirely behind
 * the near plane (cull). `depth`/`scale` come from the visible midpoint.
 */
export const projectSegment = (
	camera: CameraView,
	a: Vec3,
	b: Vec3,
	origin: Vec2,
): ProjectedSegment | undefined => {
	let va = toView(camera, a, origin);
	let vb = toView(camera, b, origin);
	if (va.z < NEAR && vb.z < NEAR) {
		return undefined;
	}
	const clip = (inside: Vec3, outside: Vec3): Vec3 => {
		const t = (NEAR - inside.z) / (outside.z - inside.z);
		return {
			x: inside.x + (outside.x - inside.x) * t,
			y: inside.y + (outside.y - inside.y) * t,
			z: NEAR,
		};
	};
	if (va.z < NEAR) {
		va = clip(vb, va);
	} else if (vb.z < NEAR) {
		vb = clip(va, vb);
	}
	const toScreen = (v: Vec3): Vec2 => {
		const s = camera.focalLength / v.z;
		return { x: origin.x + v.x * s, y: origin.y + v.y * s };
	};
	const depth = (va.z + vb.z) / 2;
	return {
		a: toScreen(va),
		b: toScreen(vb),
		depth,
		scale: camera.focalLength / depth,
	};
};

/**
 * A projected path (a skeletal n-point polyline/polygon): near-plane-clipped
 * screen geometry plus the single sort key. `runs` are the contiguous visible
 * polylines for STROKING — the near plane splits a path that dips behind the
 * camera into pieces, and closure edges appear as ordinary edges when clipped.
 * `contour` is the Sutherland–Hodgman-clipped screen polygon of the
 * implicitly-closed region, for FILLING. When nothing was clipped the two
 * agree (`runs` is one run equal to `contour`) and `clipped` is false, so a
 * paint fn can take the exact single-shape path.
 */
export interface ProjectedPath {
	readonly runs: ReadonlyArray<ReadonlyArray<Vec2>>;
	readonly contour: ReadonlyArray<Vec2>;
	/** true when the near plane actually removed or split geometry */
	readonly clipped: boolean;
	/** mean view-space depth of the visible (clipped) contour vertices */
	readonly depth: number;
	/** perspective scale at that depth (focalLength / depth) */
	readonly scale: number;
}

/**
 * Project a world-space point list (a skeletal Path's vertices) to screen.
 * Every vertex goes to view space and is projected individually, so a path
 * spanning depth foreshortens per point — the n-point generalization of
 * `projectSegment`. Near-plane handling matches the existing primitives:
 * stroke edges clip like segments (lerp to z = NEAR, splitting into runs),
 * the fill region clips like a plane (Sutherland–Hodgman). Returns
 * `undefined` when every vertex lies behind the near plane (cull).
 * `depth`/`scale` come from the mean depth of the clipped contour — one key
 * per paintable, the same accepted ceiling as segments and tilted quads.
 */
export const projectPath = (
	camera: CameraView,
	points: ReadonlyArray<Vec3>,
	closed: boolean,
	origin: Vec2,
): ProjectedPath | undefined => {
	if (points.length === 0) {
		return undefined;
	}
	const view = points.map((p) => toView(camera, p, origin));
	if (view.every((v) => v.z < NEAR)) {
		return undefined;
	}
	const toScreen = (v: Vec3): Vec2 => {
		const s = camera.focalLength / v.z;
		return { x: origin.x + v.x * s, y: origin.y + v.y * s };
	};
	const lerpToNear = (inside: Vec3, outside: Vec3): Vec3 => {
		const t = (NEAR - inside.z) / (outside.z - inside.z);
		return {
			x: inside.x + (outside.x - inside.x) * t,
			y: inside.y + (outside.y - inside.y) * t,
			z: NEAR,
		};
	};
	// fill contour: Sutherland–Hodgman against the near plane over the
	// implicitly closed polygon (identical loop to projectPlane)
	const contourView: Vec3[] = [];
	for (let i = 0; i < view.length; i++) {
		// biome-ignore lint/style/noNonNullAssertion: i and (i+1)%length are in bounds
		const a = view[i]!;
		// biome-ignore lint/style/noNonNullAssertion: see above
		const b = view[(i + 1) % view.length]!;
		const aIn = a.z >= NEAR;
		if (aIn) {
			contourView.push(a);
		}
		if (aIn !== b.z >= NEAR) {
			contourView.push(lerpToNear(aIn ? a : b, aIn ? b : a));
		}
	}
	const clipped = view.some((v) => v.z < NEAR);
	// stroke runs: clip each edge like a segment, merging contiguous visible
	// edges into one polyline; a culled or exit-clipped edge ends the run
	const runs: Array<Array<Vec2>> = [];
	if (clipped) {
		let current: Array<Vec2> = [];
		const flush = () => {
			if (current.length >= 2) {
				runs.push(current);
			}
			current = [];
		};
		const edgeCount = closed ? view.length : view.length - 1;
		for (let i = 0; i < edgeCount; i++) {
			// biome-ignore lint/style/noNonNullAssertion: i and (i+1)%length are in bounds
			const a = view[i]!;
			// biome-ignore lint/style/noNonNullAssertion: see above
			const b = view[(i + 1) % view.length]!;
			const aIn = a.z >= NEAR;
			const bIn = b.z >= NEAR;
			if (!aIn && !bIn) {
				flush();
				continue;
			}
			const va = aIn ? a : lerpToNear(b, a);
			const vb = bIn ? b : lerpToNear(a, b);
			if (current.length === 0) {
				current.push(toScreen(va));
			}
			current.push(toScreen(vb));
			if (!bIn) {
				flush();
			}
		}
		flush();
		// a clipped ring's edge list starts at vertex 0, so a visible stretch
		// wrapping past it lands as two runs meeting there — stitch them back
		// into one polyline (bit-identical endpoints: same projection of the
		// same vertex) so the stroke gets a join, not two caps
		if (closed && runs.length >= 2) {
			// biome-ignore lint/style/noNonNullAssertion: length checked above
			const first = runs[0]!;
			// biome-ignore lint/style/noNonNullAssertion: length checked above
			const last = runs[runs.length - 1]!;
			// biome-ignore lint/style/noNonNullAssertion: runs are never empty
			const seam = last[last.length - 1]!;
			// biome-ignore lint/style/noNonNullAssertion: runs are never empty
			if (seam.x === first[0]!.x && seam.y === first[0]!.y) {
				runs.shift();
				runs[runs.length - 1] = [...last, ...first.slice(1)];
			}
		}
	} else {
		runs.push(view.map(toScreen));
	}
	const depth =
		contourView.reduce((sum, v) => sum + v.z, 0) / contourView.length;
	return {
		runs,
		contour: contourView.map(toScreen),
		clipped,
		depth,
		scale: camera.focalLength / depth,
	};
};

/**
 * Clip a screen-space polygon to a rectangle (Sutherland–Hodgman against the
 * four rect half-planes). Returns the clipped polygon — possibly empty when
 * the input lies entirely outside. Used to bound a projected fill region to
 * the viewport before rasterizing (see `clipPathToRect`).
 */
export const clipPolygonToRect = (
	poly: ReadonlyArray<Vec2>,
	min: Vec2,
	max: Vec2,
): Array<Vec2> => {
	const atX = (a: Vec2, b: Vec2, x: number): Vec2 => ({
		x,
		y: a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x),
	});
	const atY = (a: Vec2, b: Vec2, y: number): Vec2 => ({
		x: a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y),
		y,
	});
	const planes: ReadonlyArray<
		readonly [(p: Vec2) => boolean, (a: Vec2, b: Vec2) => Vec2]
	> = [
		[(p) => p.x >= min.x, (a, b) => atX(a, b, min.x)],
		[(p) => p.x <= max.x, (a, b) => atX(a, b, max.x)],
		[(p) => p.y >= min.y, (a, b) => atY(a, b, min.y)],
		[(p) => p.y <= max.y, (a, b) => atY(a, b, max.y)],
	];
	let out: Array<Vec2> = [...poly];
	for (const [inside, intersect] of planes) {
		const input = out;
		out = [];
		for (let i = 0; i < input.length; i++) {
			// biome-ignore lint/style/noNonNullAssertion: i and (i+1)%length are in bounds
			const a = input[i]!;
			// biome-ignore lint/style/noNonNullAssertion: see above
			const b = input[(i + 1) % input.length]!;
			const aIn = inside(a);
			if (aIn) {
				out.push(a);
			}
			if (aIn !== inside(b)) {
				out.push(intersect(a, b));
			}
		}
		if (out.length === 0) {
			return out;
		}
	}
	return out;
};

/**
 * Clip a projected path's screen geometry to a rectangle: the fill contour
 * via `clipPolygonToRect`, the stroke runs via per-edge `clipSegmentToRect`
 * (splitting a run where it exits). A fully-inside path is returned as-is —
 * the common case stays the exact single-shape drawing. A closed unclipped
 * ring's implicit closing edge is made explicit before clipping so it is not
 * lost, and a visible stretch wrapping the ring's seam is stitched back into
 * one run. Returns `undefined` when nothing remains (cull).
 */
export const clipPathToRect = (
	path: ProjectedPath,
	closed: boolean,
	min: Vec2,
	max: Vec2,
): ProjectedPath | undefined => {
	const inside = (p: Vec2): boolean =>
		p.x >= min.x && p.x <= max.x && p.y >= min.y && p.y <= max.y;
	if (
		path.contour.every(inside) &&
		path.runs.every((run) => run.every(inside))
	) {
		return path;
	}
	const contour = clipPolygonToRect(path.contour, min, max);
	// a closed ring that survived the near plane carries its closing edge
	// implicitly (the paint fn closes it); clipping draws runs verbatim, so
	// wrap the ring into an explicit polyline first
	const sourceRuns =
		closed && !path.clipped && path.runs.length === 1
			? // biome-ignore lint/style/noNonNullAssertion: length checked above
				[[...path.runs[0]!, path.runs[0]![0]!]]
			: path.runs;
	const runs: Array<Array<Vec2>> = [];
	let current: Array<Vec2> = [];
	const flush = () => {
		if (current.length >= 2) {
			runs.push(current);
		}
		current = [];
	};
	for (const run of sourceRuns) {
		for (let i = 0; i < run.length - 1; i++) {
			// biome-ignore lint/style/noNonNullAssertion: i and i+1 are in bounds
			const a = run[i]!;
			// biome-ignore lint/style/noNonNullAssertion: see above
			const b = run[i + 1]!;
			const seg = clipSegmentToRect(a, b, min, max);
			if (seg === undefined) {
				flush();
				continue;
			}
			if (current.length === 0) {
				current.push(seg[0]);
			}
			current.push(seg[1]);
			if (seg[1] !== b) {
				// exit-clipped: the polyline leaves the rect here
				flush();
			}
		}
		flush();
	}
	// stitch a ring's wrap seam (same move as projectPath's near-plane stitch)
	if (closed && runs.length >= 2) {
		// biome-ignore lint/style/noNonNullAssertion: length checked above
		const first = runs[0]!;
		// biome-ignore lint/style/noNonNullAssertion: length checked above
		const last = runs[runs.length - 1]!;
		// biome-ignore lint/style/noNonNullAssertion: runs are never empty
		const seam = last[last.length - 1]!;
		// biome-ignore lint/style/noNonNullAssertion: runs are never empty
		if (seam.x === first[0]!.x && seam.y === first[0]!.y) {
			runs.shift();
			runs[runs.length - 1] = [...last, ...first.slice(1)];
		}
	}
	if (contour.length < 3 && runs.length === 0) {
		return undefined;
	}
	return {
		runs,
		contour,
		clipped: true,
		depth: path.depth,
		scale: path.scale,
	};
};

/**
 * Clip a screen-space segment to a rectangle (Liang–Barsky). Returns the
 * clipped pair, or `undefined` when the segment lies entirely outside.
 * ThorVG's software rasterizer pays stroke cost proportional to a path's
 * full extent — offscreen included — so segments are clipped to the
 * viewport (plus a stroke margin) before painting; a near-camera line can
 * project tens of thousands of px wide otherwise (measured ~7× the cost
 * of its visible part).
 */
export const clipSegmentToRect = (
	a: Vec2,
	b: Vec2,
	min: Vec2,
	max: Vec2,
): readonly [Vec2, Vec2] | undefined => {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	let t0 = 0;
	let t1 = 1;
	const edges: ReadonlyArray<readonly [number, number]> = [
		[-dx, a.x - min.x],
		[dx, max.x - a.x],
		[-dy, a.y - min.y],
		[dy, max.y - a.y],
	];
	for (const [p, q] of edges) {
		if (p === 0) {
			// parallel to this edge: outside it means fully outside
			if (q < 0) {
				return undefined;
			}
			continue;
		}
		const r = q / p;
		if (p < 0) {
			if (r > t1) {
				return undefined;
			}
			if (r > t0) {
				t0 = r;
			}
		} else {
			if (r < t0) {
				return undefined;
			}
			if (r < t1) {
				t1 = r;
			}
		}
	}
	const at = (t: number): Vec2 => ({ x: a.x + dx * t, y: a.y + dy * t });
	return [t0 === 0 ? a : at(t0), t1 === 1 ? b : at(t1)];
};

/**
 * The view-space depth of a world point — the painter's-sort key alone.
 * With no camera rotation this is `camera.z - p.z`; rotation tilts the
 * depth axis, so the full view transform is used. Origin only shifts x/y,
 * never depth, so a zero origin suffices.
 */
export const depthOf = (camera: CameraView, p: Vec3): number =>
	toView(camera, p, { x: 0, y: 0 }).z;
