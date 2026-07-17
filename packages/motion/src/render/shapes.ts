import * as Tvg from "@effect-motion/thorvg";
import * as Effect from "effect/Effect";
import { renderOpacity, renderSize } from "../particles/overLife";
import type { OverLife, Particle } from "../particles/Particle";
import { ParticleField } from "../particles/ParticleField";
import type { PaintFunction, PaintFunctions } from "../Renderer";
import * as Shapes from "../shapes";
import { parseColor } from "./color";
import { applyStyle, finishPaint } from "./paint";

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
		const shape = yield* Tvg.Shape.make();
		yield* Tvg.Shape.appendCircle(
			shape,
			data.x,
			data.y,
			data.radius,
			data.radius,
		);
		yield* applyStyle(shape, data);
		yield* finishPaint(shape, scene, projection);
	});

export const rect: PaintFunction<typeof Shapes.Rect> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.Shape.make();
		const quad = projection.quad;
		if (quad !== undefined) {
			// a tilted plane: the vertices are already projected to screen
			// (near-plane-clipped, 3–5 points — true perspective foreshortening,
			// not an affine), so paint the exact polygon and skip the billboard
			// transform
			for (const [i, p] of quad.entries()) {
				yield* i === 0
					? Tvg.Shape.moveTo(shape, p.x, p.y)
					: Tvg.Shape.lineTo(shape, p.x, p.y);
			}
			yield* Tvg.Shape.close(shape);
			yield* applyStyle(shape, data);
			yield* Tvg.Scene.add(scene, shape);
			return;
		}
		yield* Tvg.Shape.appendRect(shape, data.x, data.y, data.width, data.height);
		yield* applyStyle(shape, data);
		yield* finishPaint(shape, scene, projection);
	});

export const square: PaintFunction<typeof Shapes.Square> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.Shape.make();
		yield* Tvg.Shape.appendRect(shape, data.x, data.y, data.size, data.size);
		yield* applyStyle(shape, data);
		yield* finishPaint(shape, scene, projection);
	});

export const ellipse: PaintFunction<typeof Shapes.Ellipse> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.Shape.make();
		yield* Tvg.Shape.appendCircle(shape, data.x, data.y, data.rx, data.ry);

		yield* applyStyle(shape, data);
		yield* finishPaint(shape, scene, projection);
	});

export const line: PaintFunction<typeof Shapes.Line> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const shape = yield* Tvg.Shape.make();
		yield* Tvg.Shape.moveTo(shape, data.x, data.y);
		yield* Tvg.Shape.lineTo(shape, data.x2, data.y2);
		// a line has no fill; stroke defaults come from its schema
		if (data.stroke !== undefined) {
			const { r, g, b, a } = parseColor(data.stroke);
			yield* Tvg.Shape.setStrokeColor(shape, r, g, b, a);
		}
		yield* Tvg.Shape.setStrokeWidth(shape, data.strokeWidth);
		if (data.opacity !== 1) {
			yield* Tvg.Paint.setOpacity(shape, Math.round(data.opacity * 255));
		}
		yield* finishPaint(shape, scene, projection);
	});

// A group paints nothing itself: its position has already composed into its
// children's world coordinates during flatten, and each child was emitted as
// its own paintable. This is a no-op, present only so the coverage map is
// exhaustive.
export const group: PaintFunction<typeof Shapes.Group> = () => Effect.void;

export const text: PaintFunction<typeof Shapes.Text> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		const glyphs = yield* Tvg.Text.make();
		// setFont fails ("insufficient condition") when the family isn't loaded
		// into the engine yet — a missing/not-yet-fetched font. That must NOT
		// abort the frame (it would blank every other paint too): swallow it so
		// this one text simply doesn't draw and the rest of the frame renders.
		yield* Tvg.Text.setFont(glyphs, data.fontFamily).pipe(Effect.ignore);
		yield* Tvg.Text.setText(glyphs, data.text);
		const { r, g, b } = parseColor(data.fill);
		yield* Tvg.Text.setColor(glyphs, r, g, b);
		if (data.opacity !== 1) {
			yield* Tvg.Paint.setOpacity(glyphs, Math.round(data.opacity * 255));
		}
		// ThorVG QUIRK (verified against this build): text inside a nested scene
		// renders ONLY when positioned by a plain `translate` — `set_transform`,
		// `scale`, and `text_align` on a scene-child text all produce nothing. So
		// text can't use the projection's full affine or ThorVG's align. Instead:
		//  - fold the perspective scale into the FONT SIZE (setTextSize scales the
		//    glyphs; scale-transform doesn't work),
		//  - apply textAnchor/baseline as a local offset from an ESTIMATED box,
		//  - position with translate(screenX, screenY).
		// ponytail: this handles translate+uniform-scale cameras (the common
		// case). A rotated/sheared camera on text isn't expressed (text stays
		// axis-aligned); revisit if a scene tilts text in 3D.
		const scale = projection.scale > 0 ? projection.scale : 1;
		const size = data.fontSize * scale;
		yield* Tvg.Text.setSize(glyphs, size);
		// estimated text box (proportional font, ~0.6 advance/size; ascent/cap
		// factors) — used because ThorVG align doesn't work on scene-child text
		const estWidth = size * data.text.length * AVG_CHAR_WIDTH;
		const dx =
			data.textAnchor === "middle"
				? -estWidth / 2
				: data.textAnchor === "end"
					? -estWidth
					: 0;
		// text origin y is the baseline (bottom of glyphs); shift UP by ~half cap
		// height to center (middle), or up by the full ascent so the given point
		// is the TOP (hanging); leave the baseline at y (auto)
		const dy =
			data.baseline === "middle"
				? -size * CAP_CENTER
				: data.baseline === "hanging"
					? -size * ASCENT
					: 0;
		// where the anchor point (data.x, data.y) lands on screen under the camera
		const m = projection.screen;
		const screenX = m.a * data.x + m.c * data.y + m.e;
		const screenY = m.b * data.x + m.d * data.y + m.f;
		yield* Tvg.Paint.translate(glyphs, screenX + dx, screenY + dy);
		yield* Tvg.Scene.add(scene, glyphs);
	});

// Text-box estimates (see the `text` paint fn): mean advance / cap-center /
// ascent as fractions of font size, for the default sans. Used because ThorVG's
// text align/transform don't work on scene-child text in this build.
const AVG_CHAR_WIDTH = 0.6;
const CAP_CENTER = 0.35;
const ASCENT = 0.8;

/**
 * ParticleField: live particles batched into one shape PER (color, opacity)
 * bucket — ThorVG fills a shape uniformly, so particles that share a color and
 * (quantized) over-life opacity are appended into the same shape and filled
 * once. Sized/faded by the over-life curves; dead slots emit nothing.
 * ponytail: one shape per distinct (color, opacity-bucket) — far fewer than one
 * per particle, but a fully instanced path is the upgrade if this is a wall.
 */
export const particleField: PaintFunction<typeof ParticleField> = ({
	data,
	scene,
	projection,
}) =>
	Effect.gen(function* () {
		// group live particles by fill color + quantized opacity (24 buckets), so
		// each bucket is one uniformly-filled shape. Circles are appended in the
		// field's local coords (data.x/y offsets the whole field).
		const buckets = new Map<
			string,
			{ color: string; alpha: number; circles: Array<[number, number, number]> }
		>();
		for (const p of data.buffer as ReadonlyArray<Particle>) {
			if (!p.alive) {
				continue;
			}
			const r = renderSize(p, data.sizeOverLife as OverLife | undefined);
			if (r <= 0) {
				continue;
			}
			const o =
				renderOpacity(p, data.opacityOverLife as OverLife | undefined) *
				data.opacity;
			const alpha = Math.max(0, Math.min(255, Math.round(o * 255)));
			if (alpha === 0) {
				continue;
			}
			// quantize alpha to keep the bucket count bounded (~24 steps)
			const qAlpha = Math.round(alpha / 11) * 11;
			const key = `${p.color}\0${qAlpha}`;
			let bucket = buckets.get(key);
			if (bucket === undefined) {
				bucket = { color: p.color, alpha: qAlpha, circles: [] };
				buckets.set(key, bucket);
			}
			bucket.circles.push([data.x + p.x, data.y + p.y, r]);
		}

		for (const { color, alpha, circles } of buckets.values()) {
			const shape = yield* Tvg.Shape.make();
			for (const [cx, cy, r] of circles) {
				yield* Tvg.Shape.appendCircle(shape, cx, cy, r, r);
			}
			const { r, g, b } = parseColor(color);
			yield* Tvg.Shape.setFillColor(shape, r, g, b, alpha);
			yield* finishPaint(shape, scene, projection);
		}
	});

/**
 * The exhaustive paint-function map for every built-in entity. Typed
 * `PaintFunctions<...>` so a missing built-in fails to type-check (the old
 * "coverage manifest" guarantee, without a Context registry).
 *
 * Path is omitted deliberately — ThorVG has no SVG-`d`-string append, so it
 * needs a path parser (its own follow-up). Text renders (fonts load at engine
 * setup); consumers using Path provide their own paint function until then.
 */
export const builtinPaints = {
	[Shapes.Circle.name]: circle,
	[Shapes.Rect.name]: rect,
	[Shapes.Square.name]: square,
	[Shapes.Ellipse.name]: ellipse,
	[Shapes.Line.name]: line,
	[Shapes.Group.name]: group,
	[Shapes.Text.name]: text,
	[ParticleField.name]: particleField,
} as PaintFunctions<
	| typeof Shapes.Circle
	| typeof Shapes.Rect
	| typeof Shapes.Square
	| typeof Shapes.Ellipse
	| typeof Shapes.Line
	| typeof Shapes.Group
	| typeof Shapes.Text
	| typeof ParticleField
>;
