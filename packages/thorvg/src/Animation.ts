import { acquirePaint } from "./Interop.js";

/** An Animation is not a Paint — it owns its picture and is freed by `_tvg_animation_del`. */
export const make = () =>
	acquirePaint(
		"_tvg_animation_new",
		(m) => m._tvg_animation_new(),
		(m, ptr) => {
			m._tvg_animation_del(ptr);
		},
	);
