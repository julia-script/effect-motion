import { loadFont } from "@text-rendering-toolkit/font";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import * as Metrics from "../src/Metrics.js";

// JetBrains Mono: a real monospace face with known metrics (advance 600
// per 1000 upem). Fetched once, module-cached by the test runner.
const MONO_URL =
	"https://cdn.jsdelivr.net/npm/@expo-google-fonts/jetbrains-mono@0.2.3/JetBrainsMono_400Regular.ttf";

const bytesOf = (() => {
	let cached: Promise<Uint8Array> | undefined;
	return () => {
		cached ??= fetch(MONO_URL)
			.then((response) => response.arrayBuffer())
			.then((buffer) => new Uint8Array(buffer));
		return cached;
	};
})();

describe("Metrics.gridFromFont", () => {
	it("derives the grid from the font's real metrics", async () => {
		const bytes = await bytesOf();
		const grid = await Effect.runPromise(
			Metrics.gridFromFont(bytes) as Effect.Effect<
				{ charWidth: number; lineHeight: number },
				never,
				never
			>,
		);
		// JetBrains Mono is exactly 0.6 em wide per character
		expect(grid.charWidth).toBeCloseTo(0.6, 5);
		expect(grid.lineHeight).toBeGreaterThan(1);
		expect(grid.lineHeight).toBeLessThan(2);
	}, 60_000);

	it("fails with a typed error on garbage bytes", async () => {
		const exit = await Effect.runPromiseExit(
			Metrics.gridFromFont(new Uint8Array([1, 2, 3])),
		);
		expect(exit._tag).toBe("Failure");
	});

	it("grid arithmetic matches real shaping: column offsets equal advances", async () => {
		// the invisibility invariant's foundation — a fragment placed at
		// col × charWidth × fontSize must sit exactly where the same
		// character falls inside the whole line
		const bytes = await bytesOf();
		const grid = await Effect.runPromise(
			Metrics.gridFromFont(bytes) as Effect.Effect<
				{ charWidth: number; lineHeight: number },
				never,
				never
			>,
		);
		const font = await loadFont(bytes);
		try {
			const line = "const x = f(y);";
			const run = font.shape({
				text: line,
				direction: "ltr",
				script: "Latn",
				language: "und",
			});
			const fontSize = 32;
			const scale = fontSize / font.facts.unitsPerEm;
			let x = 0;
			let cluster = 0;
			for (const glyph of run.glyphs) {
				// each glyph's pen position must equal its column's grid offset
				expect(x).toBeCloseTo(cluster * grid.charWidth * fontSize, 6);
				x += glyph.xAdvance * scale;
				cluster += 1;
			}
		} finally {
			font.dispose();
		}
	}, 60_000);
});
