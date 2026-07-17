import { Effect } from "effect";
import { ThorvgWasm } from "./Engine";
import {
	acquirePaint,
	checked,
	type OwnedPaint,
	type Scratch,
	withScratch,
} from "./Interop";
import type { ThorVGModule } from "./thorvgemscripten";

/** A gradient is a Fill, not a Paint — freed by `_tvg_gradient_del`, not unref. */
const acquireGradient = (
	operation: string,
	create: (m: ThorVGModule) => number,
) =>
	acquirePaint(operation, create, (m, ptr) => {
		m._tvg_gradient_del(ptr);
	});

export const makeLinear = () =>
	acquireGradient("_tvg_linear_gradient_new", (m) =>
		m._tvg_linear_gradient_new(),
	);

export const makeRadial = () =>
	acquireGradient("_tvg_radial_gradient_new", (m) =>
		m._tvg_radial_gradient_new(),
	);

/**
 * Pack an array of `[offset, r, g, b, a]` color stops into scratch and set them.
 * Each stop is a Tvg_Color_Stop: float offset + 4 bytes rgba, laid out as the
 * struct expects (8 bytes/stop: f32 offset + 4×u8) (design D4).
 */
export const setColorStops = (
	gradient: OwnedPaint,
	stops: ReadonlyArray<{
		offset: number;
		r: number;
		g: number;
		b: number;
		a: number;
	}>,
) =>
	withScratch(stops.length * 8)((s: Scratch) =>
		ThorvgWasm.pipe(
			Effect.flatMap(({ module }) => {
				stops.forEach((stop, i) => {
					const base = i * 8;
					s.writeF32(base, stop.offset);
					s.writeBytes(
						new Uint8Array([stop.r, stop.g, stop.b, stop.a]),
						base + 4,
					);
				});
				return checked("_tvg_gradient_set_color_stops", () =>
					module._tvg_gradient_set_color_stops(
						gradient.ptr,
						s.ptr,
						stops.length,
					),
				);
			}),
		),
	);
