import * as Effect from "effect/Effect";
import type { Point, Subpath } from "./PathGeometry.js";

/** Stroke controls measured in local space, before projection. */
export interface Style {
	readonly trimStart: number;
	readonly trimEnd: number;
	readonly trimOffset: number;
	readonly strokeDasharray: ReadonlyArray<number>;
	readonly strokeDashoffset: number;
}

interface Interval {
	readonly start: number;
	readonly end: number;
}
interface Measured {
	readonly path: Subpath;
	readonly points: ReadonlyArray<Point>;
	readonly distances: ReadonlyArray<number>;
	readonly length: number;
}

const defect = (message: string): never =>
	Effect.runSync(Effect.die(new Error(`StrokeGeometry: ${message}`)));
const modulo = (value: number, period: number): number => {
	const remainder = value % period;
	return remainder < 0 ? remainder + period : remainder;
};
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const measure = (path: Subpath): Measured => {
	const points = [...path.points];
	const first = points[0];
	if (path.closed && first !== undefined) points.push(first);
	const distances = [0];
	let length = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1] ?? defect("missing segment start");
		const b = points[i] ?? defect("missing segment end");
		length += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
		distances.push(length);
	}
	if (!Number.isFinite(length)) defect("non-finite contour length");
	return { path, points, distances, length };
};

/** First vertex at or after a distance; binary search avoids rescanning long paths. */
const vertexAt = (path: Measured, distance: number): number => {
	let low = 0;
	let high = path.distances.length - 1;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if ((path.distances[middle] ?? defect("missing distance")) < distance)
			low = middle + 1;
		else high = middle;
	}
	return low;
};

const pointAt = (path: Measured, distance: number): Point => {
	const index = vertexAt(path, distance);
	const b = path.points[index] ?? defect("missing cut point");
	const end = path.distances[index] ?? defect("missing cut distance");
	if (index === 0 || end === distance) return b;
	const a = path.points[index - 1] ?? defect("missing preceding point");
	const start =
		path.distances[index - 1] ?? defect("missing preceding distance");
	const t = (distance - start) / (end - start);
	return {
		x: a.x + (b.x - a.x) * t,
		y: a.y + (b.y - a.y) * t,
		z: a.z + (b.z - a.z) * t,
	};
};

const cut = (path: Measured, interval: Interval): Subpath => {
	const points = [pointAt(path, interval.start)];
	for (let i = vertexAt(path, interval.start); i < path.points.length; i++) {
		const distance = path.distances[i] ?? defect("missing interior distance");
		if (distance >= interval.end) break;
		if (distance > interval.start)
			points.push(path.points[i] ?? defect("missing interior point"));
	}
	if (interval.end > interval.start) points.push(pointAt(path, interval.end));
	return { points, closed: false };
};

const merge = (intervals: Array<Interval>): Array<Interval> => {
	intervals.sort((a, b) => a.start - b.start || a.end - b.end);
	const merged: Array<Interval> = [];
	for (const interval of intervals) {
		const previous = merged.at(-1);
		if (previous !== undefined && interval.start <= previous.end) {
			merged[merged.length - 1] = {
				start: previous.start,
				end: Math.max(previous.end, interval.end),
			};
		} else merged.push(interval);
	}
	return merged;
};

/**
 * Select stroke fragments by total contour length, then apply subpath-anchored
 * dashes. Fills continue to use the original paths. Closed seams remain joined
 * whenever coverage reaches both sides, and zero painted entries produce dots.
 */
export const apply = (
	paths: ReadonlyArray<Subpath>,
	style: Style,
): ReadonlyArray<Subpath> => {
	if (
		![
			style.trimStart,
			style.trimEnd,
			style.trimOffset,
			style.strokeDashoffset,
		].every(Number.isFinite) ||
		style.strokeDasharray.some((value) => !Number.isFinite(value) || value < 0)
	)
		defect("stroke controls must be finite and dash lengths nonnegative");
	const start = clamp(style.trimStart);
	const end = clamp(style.trimEnd);
	if (end <= start) return [];
	const full = end - start === 1;
	const pattern =
		style.strokeDasharray.length % 2 === 0
			? style.strokeDasharray
			: [...style.strokeDasharray, ...style.strokeDasharray];
	const period = pattern.reduce((sum, value) => sum + value, 0);
	if (!Number.isFinite(period)) defect("non-finite dash period");
	if (full && period === 0) return paths;
	const measured = paths.map(measure);
	const total = measured.reduce((sum, path) => sum + path.length, 0);
	if (!Number.isFinite(total)) defect("non-finite total contour length");
	const shifted = modulo(start + modulo(style.trimOffset, 1), 1);
	const finish = shifted + end - start;
	const trim: ReadonlyArray<Interval> = full
		? [{ start: 0, end: total }]
		: finish <= 1
			? [{ start: shifted * total, end: finish * total }]
			: [
					{ start: 0, end: (finish - 1) * total },
					{ start: shifted * total, end: total },
				];
	const dashOffset = period === 0 ? 0 : modulo(style.strokeDashoffset, period);
	const output: Array<Subpath> = [];
	// Deterministic work cap: pathological dash spacing must fail, never hang or
	// silently drop geometry. Includes zero entries, which consume no distance.
	let remaining = 100_000;
	const spend = () => {
		if (--remaining < 0)
			defect("dash geometry exceeds the 100000-entry work limit");
	};
	let origin = 0;
	for (const path of measured) {
		const selection: Array<Interval> = [];
		for (const interval of trim) {
			const from = Math.max(0, interval.start - origin);
			const to = Math.min(path.length, interval.end - origin);
			if (
				to > from ||
				(path.length === 0 && from === 0 && to === 0 && (total > 0 || full))
			)
				selection.push({ start: from, end: to });
		}
		origin += path.length;
		if (path.points.length === 0 || selection.length === 0) continue;
		const painted: Array<Interval> = [];
		if (period === 0) painted.push(...selection);
		else {
			for (const range of selection) {
				// Jump directly to the cycle containing the trimmed start; the dash
				// phase is still measured from the original subpath's origin.
				const phase = modulo(modulo(range.start, period) + dashOffset, period);
				let cycle = range.start - phase;
				while (cycle <= range.end) {
					let cursor = cycle;
					for (let i = 0; i < pattern.length; i++) {
						spend();
						const size = pattern[i] ?? defect("missing dash entry");
						const next = cursor + size;
						if (i % 2 === 0) {
							const from = Math.max(cursor, range.start);
							const to = Math.min(next, range.end);
							if (
								to > from ||
								(size === 0 && cursor >= range.start && cursor <= range.end) ||
								(path.length === 0 && cursor <= 0 && next > 0)
							)
								painted.push({ start: from, end: to });
						}
						cursor = next;
					}
					const nextCycle = cycle + period;
					if (nextCycle <= cycle)
						defect("dash spacing is below numeric precision");
					cycle = nextCycle;
				}
			}
		}
		const intervals = merge(painted);
		const first = intervals[0];
		const last = intervals.at(-1);
		if (first === undefined || last === undefined) continue;
		if (
			intervals.length === 1 &&
			first.start === 0 &&
			first.end === path.length
		) {
			output.push(path.path);
			continue;
		}
		if (path.path.closed && first.start === 0 && last.end === path.length) {
			const tail = cut(path, last);
			const head = cut(path, first);
			output.push({
				points: [...tail.points, ...head.points.slice(1)],
				closed: false,
			});
			for (const interval of intervals.slice(1, -1))
				output.push(cut(path, interval));
		} else for (const interval of intervals) output.push(cut(path, interval));
	}
	return output;
};
