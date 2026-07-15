import * as Tvg from "@effect-motion/thorvg";
import * as Effect from "effect/Effect";
import { renderSize } from "../particles/overLife";
import type { OverLife, Particle } from "../particles/Particle";
import { ParticleField } from "../particles/ParticleField";
import type { PaintFunction, PaintFunctions } from "../Renderer";
import * as Shapes from "../shapes";
import { parseColor } from "./color";
import { applyStyle, finishPaint, paintQuad } from "./paint";

/**
 * ThorVG paint functions for the built-in shapes — this file is the coverage
 * manifest: `paints` is typed `PaintFunctions<...>`, so a built-in missing a
 * paint function is a type error, not a runtime surprise.
 */

export const circle: PaintFunction<typeof Shapes.Circle> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.makeShape();
		yield* Tvg.appendCircle(shape, data.x, data.y, data.radius, data.radius);
		yield* applyStyle(shape, data);
		yield* finishPaint(shape, scene, projection);
	});

export const rect: PaintFunction<typeof Shapes.Rect> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		// a tilted plane is an exact projected quad, not a billboard rect
		if (projection.quad !== undefined) {
			return yield* paintQuad(scene, projection.quad, data);
		}
		const shape = yield* Tvg.makeShape();
		yield* Tvg.appendRect(shape, data.x, data.y, data.width, data.height);
		yield* applyStyle(shape, data);
		yield* finishPaint(shape, scene, projection);
	});

export const square: PaintFunction<typeof Shapes.Square> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.makeShape();
		yield* Tvg.appendRect(shape, data.x, data.y, data.size, data.size);
		yield* applyStyle(shape, data);
		yield* finishPaint(shape, scene, projection);
	});

export const ellipse: PaintFunction<typeof Shapes.Ellipse> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.makeShape();
		yield* Tvg.appendCircle(shape, data.x, data.y, data.rx, data.ry);
		yield* applyStyle(shape, data);
		yield* finishPaint(shape, scene, projection);
	});

export const line: PaintFunction<typeof Shapes.Line> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.makeShape();
		yield* Tvg.moveTo(shape, data.x, data.y);
		yield* Tvg.lineTo(shape, data.x2, data.y2);
		// a line has no fill; stroke defaults come from its schema
		if (data.stroke !== undefined) {
			const { r, g, b, a } = parseColor(data.stroke);
			yield* Tvg.setStrokeColor(shape, r, g, b, a);
		}
		yield* Tvg.setStrokeWidth(shape, data.strokeWidth);
		if (data.opacity !== 1) {
			yield* Tvg.setOpacity(shape, Math.round(data.opacity * 255));
		}
		yield* finishPaint(shape, scene, projection);
	});

// A group paints nothing itself: its position has already composed into its
// children's world coordinates during flatten, and each child was emitted as
// its own paintable. This is a no-op, present only so the coverage map is
// exhaustive.
export const group: PaintFunction<typeof Shapes.Group> = () => Effect.void;

/**
 * ParticleField: one shape per LIVE particle, sized/faded by the over-life
 * curves, added to the scene under the field's projection. Dead slots emit
 * nothing.
 * ponytail: N shapes per frame is the paint ceiling; a batched/instanced path
 * is the upgrade if particle count becomes the wall.
 */
export const particleField: PaintFunction<typeof ParticleField> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.makeShape();
		for (const p of data.buffer as ReadonlyArray<Particle>) {
			if (!p.alive) {
				continue;
			}
			const r = renderSize(p, data.sizeOverLife as OverLife | undefined);
			// the field's x/y offsets every particle (particles are field-local)
			yield* Tvg.appendCircle(shape, data.x + p.x, data.y + p.y, r, r);
		}
		// ThorVG fills a shape uniformly, so per-particle color/opacity (which
		// the SVG sink expressed one node at a time) is not yet carried — the
		// field paints as one shape at field opacity. ponytail: split into
		// per-color shapes if particles need individual color.
		if (data.opacity !== 1) {
			yield* Tvg.setOpacity(shape, Math.round(data.opacity * 255));
		}
		yield* finishPaint(shape, scene, projection);
	});

/**
 * The exhaustive paint-function map for every built-in entity. Typed
 * `PaintFunctions<...>` so a missing built-in fails to type-check (the old
 * "coverage manifest" guarantee, without a Context registry).
 *
 * Text and Path are omitted deliberately — see render/index.ts for the
 * font/path-data follow-up. Consumers that use them provide their own paint
 * functions until then.
 */
export const builtinPaints = {
	[Shapes.Circle.name]: circle,
	[Shapes.Rect.name]: rect,
	[Shapes.Square.name]: square,
	[Shapes.Ellipse.name]: ellipse,
	[Shapes.Line.name]: line,
	[Shapes.Group.name]: group,
	[ParticleField.name]: particleField,
} as PaintFunctions<
	| typeof Shapes.Circle
	| typeof Shapes.Rect
	| typeof Shapes.Square
	| typeof Shapes.Ellipse
	| typeof Shapes.Line
	| typeof Shapes.Group
	| typeof ParticleField
>;
