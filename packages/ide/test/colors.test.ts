import * as Color from "effect-motion/Color";
import { describe, expect, it } from "vitest";
import * as Colors from "../src/Colors";
import { twPalette } from "../src/twPalette";
import { unreachable } from "./support/raise";

const file = (body: string) =>
	`import { Color } from "effect-motion";\n${body}\n`;

const only = (source: string) => Colors.scan(source)[0] ?? unreachable();

describe("the checked-in Tailwind palette", () => {
	it("matches Color.twMap channel for channel", () => {
		const live = Object.fromEntries(
			Object.entries(Color.twMap).map(([name, shades]) => [
				name,
				Object.fromEntries(
					Object.entries(shades).map(([shade, color]) => [
						shade,
						[
							Math.round(color["~r"]),
							Math.round(color["~g"]),
							Math.round(color["~b"]),
						],
					]),
				),
			]),
		);
		// regenerate with `pnpm --filter @effect-motion/ide sync:palette`
		expect(JSON.parse(JSON.stringify(twPalette))).toEqual(live);
	});
});

describe("namespaces", () => {
	it("finds the barrel import", () => {
		expect([
			...Colors.namespaces(`import { Color, Scene } from "effect-motion";`),
		]).toEqual(["Color"]);
	});

	it("finds a deep namespace import under any alias", () => {
		expect([
			...Colors.namespaces(`import * as C from "effect-motion/Color";`),
		]).toEqual(["C"]);
	});

	it("follows a renamed barrel binding", () => {
		expect([
			...Colors.namespaces(`import { Color as Paint } from "effect-motion";`),
		]).toEqual(["Paint"]);
	});

	it("ignores type-only imports and unrelated packages", () => {
		expect(
			Colors.namespaces(`import type { Color } from "effect-motion";`).size,
		).toBe(0);
		expect(Colors.namespaces(`import { Color } from "chroma-js";`).size).toBe(
			0,
		);
	});
});

describe("scanning", () => {
	it("reads hex, with and without alpha", () => {
		expect(only(file(`const a = Color.hex("#7f5af0");`)).rgba).toEqual({
			r: 127,
			g: 90,
			b: 240,
			a: 1,
		});
		// chroma reports hex alpha to two decimals, and Color.hex takes it
		// straight from chroma — a swatch matches what the renderer paints
		expect(only(file(`const a = Color.hex("#7f5af080");`)).rgba.a).toBe(0.5);
	});

	it("reads rgba", () => {
		expect(only(file(`const a = Color.rgba(22, 22, 29);`)).rgba).toEqual({
			r: 22,
			g: 22,
			b: 29,
			a: 1,
		});
		expect(only(file(`const a = Color.rgba(0, 0, 0, 0.5);`)).rgba.a).toBe(0.5);
	});

	it("reads the perceptual constructors", () => {
		const oklch = only(file(`const a = Color.oklch(0.7, 0.15, 300);`)).rgba;
		const [r, g, b] = Color.oklch(0.7, 0.15, 300).pipe(
			(color) => [color["~r"], color["~g"], color["~b"]] as const,
		);
		expect(oklch.r).toBeCloseTo(Math.round(r), -1);
		expect(oklch.g).toBeCloseTo(Math.round(g), -1);
		expect(oklch.b).toBeCloseTo(Math.round(b), -1);
	});

	it("reads tw, defaulting the shade to 400 like Color.tw does", () => {
		const bare = only(file(`const a = Color.tw("violet");`)).rgba;
		const explicit = only(file(`const a = Color.tw("violet", "400");`)).rgba;
		expect(bare).toEqual(explicit);
		const live = Color.tw("violet");
		expect(bare.r).toBe(Math.round(live["~r"]));
	});

	it("reports a range covering the whole call", () => {
		const source = file(`const a = Color.hex("#7f5af0");`);
		const literal = only(source);
		expect(source.slice(literal.start, literal.end)).toBe(
			`Color.hex("#7f5af0")`,
		);
	});

	it("follows the file's own alias", () => {
		const source = `import * as C from "effect-motion/Color";\nconst a = C.rgba(1, 2, 3);`;
		expect(only(source).namespace).toBe("C");
	});

	it("skips calls whose arguments are not literals", () => {
		expect(Colors.scan(file(`const a = Color.hex(brandHex);`))).toEqual([]);
		expect(Colors.scan(file(`const a = Color.rgba(r, g, b);`))).toEqual([]);
	});

	it("skips calls that are still being typed", () => {
		expect(Colors.scan(file(`const a = Color.hex("#7f5af0"`))).toEqual([]);
	});

	it("skips an unknown palette entry rather than guessing", () => {
		expect(Colors.scan(file(`const a = Color.tw("chartreuse");`))).toEqual([]);
		expect(Colors.scan(file(`const a = Color.tw("violet", "42");`))).toEqual(
			[],
		);
	});

	it("does not claim another library's lookalike", () => {
		expect(Colors.scan(file(`const a = MyColor.hex("#7f5af0");`))).toEqual([]);
	});

	it("does nothing in a file that never imports effect-motion", () => {
		expect(Colors.scan(`const a = Color.hex("#7f5af0");`)).toEqual([]);
	});

	it("finds every literal in a scene, in document order", () => {
		const source = file(
			[
				`const a = Color.hex("#e53170");`,
				`const b = Color.rgba(22, 22, 29);`,
				`const c = Color.tw("violet", "500");`,
			].join("\n"),
		);
		const found = Colors.scan(source);
		expect(found.map((literal) => literal.kind)).toEqual(["hex", "rgba", "tw"]);
		expect(found.map((literal) => literal.start)).toEqual(
			[...found].map((literal) => literal.start).sort((x, y) => x - y),
		);
	});

	it("handles nested parentheses and commas inside an argument", () => {
		const source = file(`const a = Color.rgba(22, 22, 29, 0.5).pipe(x);`);
		expect(only(source).rgba.a).toBe(0.5);
	});
});

describe("formatting", () => {
	const literal = (kind: Colors.ColorKind, text: string) =>
		only(file(`const a = ${text};`)) satisfies { kind: typeof kind };

	it("keeps the constructor the author chose", () => {
		expect(
			Colors.format(literal("rgba", `Color.rgba(1, 2, 3)`), {
				r: 10,
				g: 20,
				b: 30,
				a: 1,
			}),
		).toBe("Color.rgba(10, 20, 30)");
		expect(
			Colors.format(literal("hex", `Color.hex("#000000")`), {
				r: 127,
				g: 90,
				b: 240,
				a: 1,
			}),
		).toBe(`Color.hex("#7f5af0")`);
	});

	it("keeps the file's alias", () => {
		const source = `import * as C from "effect-motion/Color";\nconst a = C.rgba(1, 2, 3);`;
		expect(Colors.format(only(source), { r: 1, g: 2, b: 3, a: 1 })).toBe(
			"C.rgba(1, 2, 3)",
		);
	});

	it("appends alpha only when it is not opaque", () => {
		const parsed = literal("rgba", `Color.rgba(1, 2, 3)`);
		expect(Colors.format(parsed, { r: 1, g: 2, b: 3, a: 1 })).not.toContain(
			", 1)",
		);
		expect(Colors.format(parsed, { r: 1, g: 2, b: 3, a: 0.5 })).toBe(
			"Color.rgba(1, 2, 3, 0.5)",
		);
	});

	it("falls back to hex for tw, whose palette cannot hold an arbitrary colour", () => {
		expect(
			Colors.format(literal("tw", `Color.tw("violet", "500")`), {
				r: 1,
				g: 2,
				b: 3,
				a: 1,
			}),
		).toBe(`Color.hex("#010203")`);
	});

	it("round-trips a perceptual constructor through the picker", () => {
		const parsed = literal("oklch", `Color.oklch(0.7, 0.15, 300)`);
		const rewritten = Colors.format(parsed, parsed.rgba);
		const reparsed = only(file(`const a = ${rewritten};`));
		expect(reparsed.rgba).toEqual(parsed.rgba);
	});

	it("writes an alpha channel into hex", () => {
		expect(
			Colors.format(literal("hex", `Color.hex("#000000")`), {
				r: 255,
				g: 0,
				b: 0,
				a: 0.5,
			}),
		).toBe(`Color.hex("#ff000080")`);
	});
});
