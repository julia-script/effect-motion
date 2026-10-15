import * as Effect from "effect/Effect";
import type * as Entity from "effect-motion/Entity";

/** A local point, including depth before camera projection. */
export interface Point {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

/** An authored contour; closure is implicit rather than a repeated endpoint. */
export interface Subpath {
	readonly points: ReadonlyArray<Point>;
	readonly closed: boolean;
}

// Local units, independent of the camera. A fixed cap bounds hostile curvature.
const tolerance = 0.25;
const maxDepth = 16;
const finitePoint = (point: Point): Point => {
	if (
		!Number.isFinite(point.x) ||
		!Number.isFinite(point.y) ||
		!Number.isFinite(point.z)
	) {
		return Effect.runSync(
			Effect.die("Path geometry exceeds finite coordinate range"),
		);
	}
	return point;
};
const samePoint = (a: Point, b: Point) =>
	a.x === b.x && a.y === b.y && a.z === b.z;
const origin: Point = { x: 0, y: 0, z: 0 };
const midpoint = (a: Point, b: Point): Point => ({
	x: a.x / 2 + b.x / 2,
	y: a.y / 2 + b.y / 2,
	z: a.z / 2 + b.z / 2,
});
const distance = (a: Point, b: Point) =>
	Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// Distance to the finite chord, not its supporting line: collinear overshoot
// must subdivide too. Checking both controls also catches midpoint inflections.
const chordDistance = (p: Point, a: Point, b: Point): number => {
	const length = distance(a, b);
	if (length === 0) return distance(p, a);
	const dx = (b.x - a.x) / length;
	const dy = (b.y - a.y) / length;
	const dz = (b.z - a.z) / length;
	const t = Math.max(
		0,
		Math.min(length, (p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz),
	);
	return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy, p.z - a.z - t * dz);
};

const cubic = (
	out: Array<Point>,
	a: Point,
	b: Point,
	c: Point,
	d: Point,
	depth = 0,
): void => {
	if (
		depth === maxDepth ||
		Math.max(chordDistance(b, a, d), chordDistance(c, a, d)) <= tolerance
	) {
		out.push(d);
		return;
	}
	const ab = midpoint(a, b);
	const bc = midpoint(b, c);
	const cd = midpoint(c, d);
	const abc = midpoint(ab, bc);
	const bcd = midpoint(bc, cd);
	const center = midpoint(abc, bcd);
	cubic(out, a, ab, abc, center, depth + 1);
	cubic(out, center, bcd, cd, d, depth + 1);
};
const quadratic = (
	out: Array<Point>,
	a: Point,
	b: Point,
	c: Point,
	depth = 0,
): void => {
	if (depth === maxDepth || chordDistance(b, a, c) <= tolerance) {
		out.push(c);
		return;
	}
	const ab = midpoint(a, b);
	const bc = midpoint(b, c);
	const center = midpoint(ab, bc);
	quadratic(out, a, ab, center, depth + 1);
	quadratic(out, center, bc, c, depth + 1);
};

type Arc = Extract<Entity.PathCommand, { _tag: "A" | "a" }>;
const arc = (
	out: Array<Point>,
	start: Point,
	end: Point,
	command: Arc,
): void => {
	if (start.x === end.x && start.y === end.y) return;
	let rx = Math.abs(command.rx);
	let ry = Math.abs(command.ry);
	if (rx === 0 || ry === 0) {
		out.push(end);
		return;
	}
	const rotation = ((command.xAxisRotation % 360) * Math.PI) / 180;
	const cos = Math.cos(rotation);
	const sin = Math.sin(rotation);
	const dx = start.x / 2 - end.x / 2;
	const dy = start.y / 2 - end.y / 2;
	const xp = cos * dx + sin * dy;
	const yp = -sin * dx + cos * dy;
	const correction = Math.hypot(xp / rx, yp / ry);
	if (correction > 1) {
		rx *= correction;
		ry *= correction;
	}
	const u = xp / rx;
	const v = yp / ry;
	const radius = Math.hypot(u, v);
	const factor = Math.sqrt(Math.max(0, 1 - radius * radius));
	const sign = command.largeArc === command.sweep ? -1 : 1;
	const cxp = sign * rx * (v / radius) * factor;
	const cyp = -sign * ry * (u / radius) * factor;
	const cx = cos * cxp - sin * cyp + start.x / 2 + end.x / 2;
	const cy = sin * cxp + cos * cyp + start.y / 2 + end.y / 2;
	if (![rx, ry, radius, cx, cy].every(Number.isFinite) || radius === 0) {
		Effect.runSync(
			Effect.die("Path arc geometry exceeds finite coordinate range"),
		);
	}
	const from = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx);
	const to = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx);
	let sweep = to - from;
	if (command.sweep && sweep < 0) sweep += 2 * Math.PI;
	if (!command.sweep && sweep > 0) sweep -= 2 * Math.PI;
	const at = (t: number): Point => {
		const angle = from + sweep * t;
		const x = rx * Math.cos(angle);
		const y = ry * Math.sin(angle);
		return finitePoint({
			x: cx + cos * x - sin * y,
			y: cy + sin * x + cos * y,
			z: start.z * (1 - t) + end.z * t,
		});
	};
	const append = (
		lo: number,
		hi: number,
		a: Point,
		b: Point,
		depth: number,
	): void => {
		// The second derivative norm is bounded by max(rx,ry). This error
		// bound cannot miss full turns, inflections, or very eccentric arcs.
		const angle = Math.abs(sweep * (hi - lo));
		if (
			depth === maxDepth ||
			(Math.max(rx, ry) * angle * angle) / 8 <= tolerance
		) {
			out.push(b);
			return;
		}
		const mid = (lo + hi) / 2;
		const p = at(mid);
		append(lo, mid, a, p, depth + 1);
		append(mid, hi, p, b, depth + 1);
	};
	append(0, 1, start, end, 0);
};

/** Resolve typed SVG commands into deterministic local 3D contours. */
export const flatten = (
	commands: ReadonlyArray<Entity.PathCommand>,
): ReadonlyArray<Subpath> => {
	const paths: Array<Subpath> = [];
	let points: Array<Point> = [];
	let current = origin;
	let start = origin;
	let cubicControl: Point | undefined;
	let quadraticControl: Point | undefined;
	const finish = (closed: boolean): void => {
		if (points.length >= 2) paths.push({ points, closed });
		points = [];
	};
	for (const command of commands) {
		const relative = command._tag === command._tag.toLowerCase();
		const point = (x: number, y: number, z = 0): Point =>
			finitePoint(
				relative
					? { x: current.x + x, y: current.y + y, z: current.z + z }
					: { x, y, z },
			);
		const reflect = (control: Point | undefined): Point =>
			control === undefined
				? current
				: finitePoint({
						x: current.x + (current.x - control.x),
						y: current.y + (current.y - control.y),
						z: current.z + (current.z - control.z),
					});
		let nextCubic: Point | undefined;
		let nextQuadratic: Point | undefined;
		if (
			command._tag !== "M" &&
			command._tag !== "m" &&
			command._tag !== "Z" &&
			command._tag !== "z" &&
			points.length === 0
		)
			points.push(current);
		switch (command._tag) {
			case "M":
			case "m":
				finish(false);
				current = point(command.x, command.y, command.z);
				start = current;
				points.push(current);
				break;
			case "Z":
			case "z": {
				const first = points[0];
				if (first !== undefined && !samePoint(first, start)) {
					points.push(start);
					finish(false);
				} else finish(true);
				current = start;
				break;
			}
			case "L":
			case "l":
				current = point(command.x, command.y, command.z);
				points.push(current);
				break;
			case "H":
			case "h":
				current = finitePoint({
					...current,
					x: relative ? current.x + command.x : command.x,
				});
				points.push(current);
				break;
			case "V":
			case "v":
				current = finitePoint({
					...current,
					y: relative ? current.y + command.y : command.y,
				});
				points.push(current);
				break;
			case "C":
			case "c": {
				const end = point(command.x, command.y, command.z);
				nextCubic = point(command.x2, command.y2, command.z2);
				cubic(
					points,
					current,
					point(command.x1, command.y1, command.z1),
					nextCubic,
					end,
				);
				current = end;
				break;
			}
			case "S":
			case "s": {
				const end = point(command.x, command.y, command.z);
				nextCubic = point(command.x2, command.y2, command.z2);
				cubic(points, current, reflect(cubicControl), nextCubic, end);
				current = end;
				break;
			}
			case "Q":
			case "q": {
				const end = point(command.x, command.y, command.z);
				nextQuadratic = point(command.x1, command.y1, command.z1);
				quadratic(points, current, nextQuadratic, end);
				current = end;
				break;
			}
			case "T":
			case "t": {
				const end = point(command.x, command.y, command.z);
				nextQuadratic = reflect(quadraticControl);
				quadratic(points, current, nextQuadratic, end);
				current = end;
				break;
			}
			case "A":
			case "a": {
				const end = point(command.x, command.y, command.z);
				if (current.x === end.x && current.y === end.y && current.z !== end.z) {
					// The arc is omitted in XY, but subsequent commands start at its
					// endpoint depth. Do not turn this discontinuity into a segment.
					finish(false);
					points.push(end);
				} else arc(points, current, end, command);
				current = end;
				break;
			}
		}
		cubicControl = nextCubic;
		quadraticControl = nextQuadratic;
	}
	finish(false);
	return paths;
};
