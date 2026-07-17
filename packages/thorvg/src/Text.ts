import { Effect } from "effect";
import { ThorvgWasm } from "./Engine";
import {
	acquirePaint,
	checked,
	freePaint,
	type OwnedPaint,
	withCstr,
} from "./Interop";

// Text mutators (design D1/D4). Strings (text content, font names) are
// marshalled to NUL-terminated UTF-8 in scratch. ThorVG copies what it needs
// during the call, so the scratch can free on scope close.

export const make = () =>
	acquirePaint("_tvg_text_new", (m) => m._tvg_text_new(), freePaint);

export const setText = (text: OwnedPaint, content: string) =>
	withCstr("_tvg_text_set_text", content, (m, ptr) =>
		m._tvg_text_set_text(text.ptr, ptr),
	);

export const setFont = (text: OwnedPaint, family: string) =>
	withCstr("_tvg_text_set_font", family, (m, ptr) =>
		m._tvg_text_set_font(text.ptr, ptr),
	);

export const setSize = (text: OwnedPaint, size: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_text_set_size", () =>
				module._tvg_text_set_size(text.ptr, size),
			),
		),
	);

export const setColor = (text: OwnedPaint, r: number, g: number, b: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_text_set_color", () =>
				module._tvg_text_set_color(text.ptr, r, g, b),
			),
		),
	);

/**
 * Text alignment as normalized anchors (0 = left/top, 0.5 = center, 1 =
 * right/bottom). ponytail: in the current binding this call succeeds but does
 * not visibly reposition a translated single-line text (design D4) — passed
 * through for forward-compat; precise alignment needs a measure pass.
 */
export const align = (text: OwnedPaint, halign: number, valign: number) =>
	ThorvgWasm.pipe(
		Effect.flatMap(({ module }) =>
			checked("_tvg_text_align", () =>
				module._tvg_text_align(text.ptr, halign, valign),
			),
		),
	);
