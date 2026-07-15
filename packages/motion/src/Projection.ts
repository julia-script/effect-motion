/**
 * EXPERIMENTAL — 2.5D projection core (proof of concept, not public API).
 *
 * This module is the load-bearing math for turning effect-motion into a
 * 2.5D library: entities live at a world `{x, y, z}`, a free camera looks
 * at them from anywhere, and each entity is projected to a 2D screen anchor
 * plus a *camera-space depth*. That depth — not the entity tree's order —
 * decides what paints in front of what.
 *
 * It is deliberately dependency-free and pure: no Effect, no Schema, no sink.
 * The whole point of the POC is that projection + depth sorting is a small,
 * portable, deterministic function that any sink can consume. Wiring it into
 * the runner/sinks is the breaking change specified in
 * `openspec/changes/add-2.5d-projection/`; this file just proves the core.
 *
 * Model (see design.md, D2 — the "reference-plane" perspective):
 *   - The camera looks from `position` toward `target`; the distance between
 *     them (`d0`) defines the reference plane that renders at authored size.
 *   - A world point's camera-space depth is its distance along the view
 *     direction. Larger depth = farther from the camera = painted first.
 *   - Perspective scale is `d0 / depth`: a card on the reference plane keeps
 *     its authored size (scale 1), nearer cards grow, farther cards shrink
 *     and drift toward the vanishing point (the screen center).
 *   - Orthographic projection drops the scale falloff (scale always 1) but
 *     keeps the depth for sorting — a flat mode that subsumes the old
 *     pan/zoom camera.
 */

export interface Vec3 {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export interface Camera3D {
	/** eye position in world space */
	readonly position: Vec3;
	/** the point the camera looks at; its plane renders at authored size */
	readonly target: Vec3;
	/** world up; defaults to +Y. Roll the camera by tilting this. */
	readonly up?: Vec3;
	/** perspective (size falloff with depth) or orthographic (flat). */
	readonly projection?: "perspective" | "orthographic";
}

export interface Viewport {
	readonly width: number;
	readonly height: number;
}

/** A world point mapped to the screen, with the depth that orders it. */
export interface Projected {
	/** screen-space anchor X (px), origin top-left */
	readonly x: number;
	/** screen-space anchor Y (px), Y grows downward */
	readonly y: number;
	/** billboard scale — 1 at the reference plane, >1 nearer, <1 farther */
	readonly scale: number;
	/** camera-space depth; larger = farther. The painter's-order key. */
	readonly depth: number;
	/** false when the point is at/behind the camera plane (culled) */
	readonly visible: boolean;
}

const DEFAULT_UP: Vec3 = { x: 0, y: 1, z: 0 };
// depth at/under this (world units in front of the eye) counts as culled.
const NEAR_EPSILON = 1e-6;

const sub = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.x - b.x,
	y: a.y - b.y,
	z: a.z - b.z,
});

const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;

const cross = (a: Vec3, b: Vec3): Vec3 => ({
	x: a.y * b.z - a.z * b.y,
	y: a.z * b.x - a.x * b.z,
	z: a.x * b.y - a.y * b.x,
});

const length = (a: Vec3): number => Math.sqrt(dot(a, a));

const normalize = (a: Vec3): Vec3 => {
	const len = length(a);
	// a degenerate basis (camera at its own target) is an author error, but
	// return a stable axis rather than NaN so a frame never renders garbage.
	if (len < NEAR_EPSILON) {
		return { x: 0, y: 0, z: 1 };
	}
	return { x: a.x / len, y: a.y / len, z: a.z / len };
};

/**
 * The camera's orthonormal view basis and reference distance, computed once
 * per frame and reused for every point (this is the per-frame setup a sink's
 * projection pass hoists out of the per-entity loop).
 */
export interface ViewBasis {
	readonly right: Vec3;
	readonly up: Vec3;
	readonly forward: Vec3;
	readonly position: Vec3;
	/** distance eye→target: the plane that renders at authored size */
	readonly referenceDistance: number;
	readonly perspective: boolean;
}

export const viewBasis = (camera: Camera3D): ViewBasis => {
	const forward = normalize(sub(camera.target, camera.position));
	const worldUp = camera.up ?? DEFAULT_UP;
	// right-handed: world +X → screen +X, world +Y → screen +Y (up)
	const right = normalize(cross(worldUp, forward));
	const up = cross(forward, right); // already unit-length (orthonormal)
	return {
		right,
		up,
		forward,
		position: camera.position,
		referenceDistance: length(sub(camera.target, camera.position)),
		perspective: (camera.projection ?? "perspective") === "perspective",
	};
};

/** Project one world point through a precomputed basis. */
export const projectWith = (
	point: Vec3,
	basis: ViewBasis,
	viewport: Viewport,
): Projected => {
	const d = sub(point, basis.position);
	const depth = dot(d, basis.forward);
	const cx = viewport.width / 2;
	const cy = viewport.height / 2;
	if (depth <= NEAR_EPSILON) {
		// at or behind the eye: no valid projection. Keep depth for stable
		// ordering, mark invisible so the sink skips it.
		return { x: cx, y: cy, scale: 0, depth, visible: false };
	}
	const viewX = dot(d, basis.right);
	const viewY = dot(d, basis.up);
	const scale = basis.perspective ? basis.referenceDistance / depth : 1;
	return {
		x: cx + viewX * scale,
		// screen Y grows downward, world +Y is up → subtract
		y: cy - viewY * scale,
		scale,
		depth,
		visible: true,
	};
};

/** Convenience: project a single point (rebuilds the basis each call). */
export const project = (
	point: Vec3,
	camera: Camera3D,
	viewport: Viewport,
): Projected => projectWith(point, viewBasis(camera), viewport);

/**
 * Order a draw list back-to-front for the painter's algorithm.
 *
 * This is the answer to "the tree order is not what decides what is in front":
 * a single stable sort by camera-space depth. Determinism is guaranteed by an
 * explicit original-index tiebreaker, so equal depths never reorder between
 * runs or platforms regardless of the engine's `Array.prototype.sort`
 * stability. O(n log n) on the visible leaves — trivial for scene sizes, and
 * the only real cost the SVG target pays for depth (a GPU sink would use a
 * z-buffer instead; see design.md).
 *
 * ponytail: temporal coherence — frame-to-frame the order barely changes.
 * Keeping the previous frame's order and insertion-sorting is ~O(n); swap it
 * in here if a huge scene ever makes the full sort show up in a profile.
 */
export const depthOrder = <T>(
	items: ReadonlyArray<T>,
	depthOf: (item: T) => number,
): Array<T> =>
	items
		.map((item, index) => ({ item, index, depth: depthOf(item) }))
		.sort(
			(a, b) =>
				// farther (larger depth) first; ties break by original index
				b.depth - a.depth || a.index - b.index,
		)
		.map((entry) => entry.item);
