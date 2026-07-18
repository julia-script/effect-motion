import { Effect, Ref } from "effect";
import { ThorvgWasm } from "./Engine.js";
import {
	acquirePaint,
	checked,
	freePaint,
	type OwnedPaint,
} from "./Interop.js";

export const make = () =>
	acquirePaint("_tvg_scene_new", (m) => m._tvg_scene_new(), freePaint);

/** Add a paint to a scene. Transfers ownership: the scene frees it now (design D2). */
export const add = (scene: OwnedPaint, child: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_scene_add", () =>
				module._tvg_scene_add(scene.ptr, child.ptr),
			),
		),
		Effect.andThen(Ref.set(child.owned, false)),
	);

export const clearEffects = (scene: OwnedPaint) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_scene_clear_effects", () =>
				module._tvg_scene_clear_effects(scene.ptr),
			),
		),
	);

export const addGaussianBlur = (
	scene: OwnedPaint,
	sigma: number,
	direction: number,
	border: number,
	quality: number,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_scene_add_effect_gaussian_blur", () =>
				module._tvg_scene_add_effect_gaussian_blur(
					scene.ptr,
					sigma,
					direction,
					border,
					quality,
				),
			),
		),
	);

export const addDropShadow = (
	scene: OwnedPaint,
	r: number,
	g: number,
	b: number,
	a: number,
	angle: number,
	distance: number,
	sigma: number,
	quality: number,
) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_scene_add_effect_drop_shadow", () =>
				module._tvg_scene_add_effect_drop_shadow(
					scene.ptr,
					r,
					g,
					b,
					a,
					angle,
					distance,
					sigma,
					quality,
				),
			),
		),
	);
