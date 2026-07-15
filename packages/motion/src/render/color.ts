/**
 * Parse a CSS color string to RGBA bytes for ThorVG's `setFillColor` /
 * `setStrokeColor` (which take `r,g,b,a` 0–255). The SVG sink passed color
 * strings straight through; ThorVG rasterises, so it needs the bytes.
 *
 * Supported: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()/rgba()`, and the
 * few named colors the built-in defaults use (white/black/transparent).
 * ponytail: the full 147-name CSS table isn't inlined — hex covers authored
 * scenes; add a name here when a default or demo needs it.
 */

export interface Rgba {
	readonly r: number;
	readonly g: number;
	readonly b: number;
	readonly a: number;
}

const NAMED: Record<string, Rgba> = {
	white: { r: 255, g: 255, b: 255, a: 255 },
	black: { r: 0, g: 0, b: 0, a: 255 },
	transparent: { r: 0, g: 0, b: 0, a: 0 },
	red: { r: 255, g: 0, b: 0, a: 255 },
	green: { r: 0, g: 128, b: 0, a: 255 },
	blue: { r: 0, g: 0, b: 255, a: 255 },
};

const hexPair = (s: string): number => Number.parseInt(s, 16);

export const parseColor = (input: string): Rgba => {
	const color = input.trim().toLowerCase();

	const named = NAMED[color];
	if (named !== undefined) {
		return named;
	}

	if (color.startsWith("#")) {
		const hex = color.slice(1);
		// #rgb / #rgba → expand each nibble to a byte
		if (hex.length === 3 || hex.length === 4) {
			const r = hexPair(hex[0]! + hex[0]!);
			const g = hexPair(hex[1]! + hex[1]!);
			const b = hexPair(hex[2]! + hex[2]!);
			const a = hex.length === 4 ? hexPair(hex[3]! + hex[3]!) : 255;
			return { r, g, b, a };
		}
		if (hex.length === 6 || hex.length === 8) {
			const r = hexPair(hex.slice(0, 2));
			const g = hexPair(hex.slice(2, 4));
			const b = hexPair(hex.slice(4, 6));
			const a = hex.length === 8 ? hexPair(hex.slice(6, 8)) : 255;
			return { r, g, b, a };
		}
	}

	const rgbMatch = color.match(
		/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+))?\s*\)$/,
	);
	if (rgbMatch !== null) {
		const r = Math.round(Number(rgbMatch[1]));
		const g = Math.round(Number(rgbMatch[2]));
		const b = Math.round(Number(rgbMatch[3]));
		// alpha is 0–1 in CSS; scale to 0–255
		const a =
			rgbMatch[4] !== undefined ? Math.round(Number(rgbMatch[4]) * 255) : 255;
		return { r, g, b, a };
	}

	// unknown color: opaque white (the visible default) rather than a throw —
	// a bad color string should not crash a render mid-frame.
	// ponytail: widen NAMED / add rgb% support if a real scene needs it.
	return { r: 255, g: 255, b: 255, a: 255 };
};
