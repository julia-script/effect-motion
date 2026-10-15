import { Effect } from "effect";
import * as Stream from "effect/Stream";
import type * as Entity from "effect-motion/Entity";
import * as Scene from "effect-motion/Scene";

/** run a scene and collect every frame */
export const framesOf = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Array<Scene.Frame<never>>> =>
	Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, { width: 800, height: 600 }) as never,
		).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<Scene.Frame<never>>,
			never,
			never
		>,
	).then((chunk) => [...chunk]);

/** every Text entity in a frame, in id order */
export const textsOf = (
	frame: Scene.Frame<never>,
): Array<Entity.EntityByTag<"Text">> =>
	Object.keys(frame.instances)
		.sort()
		.flatMap((id) => {
			const data = frame.instances[id]?.data;
			return data !== undefined && data._tag === "Text" ? [data] : [];
		});

/**
 * The frame's painted character cells: one entry per visible non-space
 * character, keyed by its quantized position, valued by its effective
 * color and opacity. Two frames with equal cell maps LOOK the same — the
 * comparison the split/consolidate invisibility scenarios need.
 */
export const cellMapOf = (
	frame: Scene.Frame<never>,
	grid: { readonly charWidth: number; readonly lineHeight: number },
	fontSize: number,
): Map<string, string> => {
	const cells = new Map<string, string>();
	for (const text of textsOf(frame)) {
		if (text.opacity === 0 || !text.visible) {
			continue;
		}
		for (let index = 0; index < text.text.length; index++) {
			const character = text.text[index] ?? " ";
			if (character === " ") {
				continue;
			}
			const x = text.position.x + index * grid.charWidth * fontSize;
			const y = text.position.y;
			const span = (text.spans ?? []).find(
				(candidate) => candidate.from <= index && index < candidate.to,
			);
			const color = span?.fillColor ?? text.fillColor;
			const key = `${x.toFixed(3)},${y.toFixed(3)},${character}`;
			cells.set(key, `${JSON.stringify(color)}@${text.opacity.toFixed(4)}`);
		}
	}
	return cells;
};
