/** Centered local contours shared by Rect fills and stroke selection. */
export type Point = readonly [number, number];

/** Clamp only the render radius; signed dimensions still reflect geometry. */
export const radius = (width: number, height: number, value: number): number =>
	Math.max(0, Math.min(value, Math.abs(width) / 2, Math.abs(height) / 2));

/**
 * Clockwise from the top-left top-edge tangent for positive dimensions.
 * Sixteen segments per quarter arc match Circle's angular resolution.
 * Tangencies are exact, and coincident pill/circle tangencies are emitted
 * once: at most 68 points, with closure represented by the consumer.
 */
export const contour = (
	width: number,
	height: number,
	cornerRadius: number,
): Array<Point> => {
	const r = radius(width, height, cornerRadius);
	if (r === 0) {
		return [
			[-width / 2, height / 2],
			[width / 2, height / 2],
			[width / 2, -height / 2],
			[-width / 2, -height / 2],
		];
	}
	const x = Math.abs(width) / 2;
	const y = Math.abs(height) / 2;
	const points: Array<Point> = [];
	const push = (px: number, py: number): void => {
		const point: Point = [px * Math.sign(width), py * Math.sign(height)];
		const last = points.at(-1);
		if (last === undefined || last[0] !== point[0] || last[1] !== point[1])
			points.push(point);
	};
	const arc = (
		start: Point,
		end: Point,
		cx: number,
		cy: number,
		angle: number,
	): void => {
		push(...start);
		for (let step = 1; step < 16; step++) {
			const theta = angle - (step / 16) * (Math.PI / 2);
			push(cx + r * Math.cos(theta), cy + r * Math.sin(theta));
		}
		push(...end);
	};
	push(-x + r, y);
	// Explicit tangencies avoid trigonometric residue at the straight edges.
	arc([x - r, y], [x, y - r], x - r, y - r, Math.PI / 2);
	arc([x, -y + r], [x - r, -y], x - r, -y + r, 0);
	arc([-x + r, -y], [-x, -y + r], -x + r, -y + r, -Math.PI / 2);
	arc([-x, y - r], [-x + r, y], -x + r, y - r, -Math.PI);
	const first = points[0];
	const last = points.at(-1);
	if (
		first !== undefined &&
		last !== undefined &&
		first[0] === last[0] &&
		first[1] === last[1]
	)
		points.pop();
	return points;
};
