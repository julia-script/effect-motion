import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Color from "../src/Color";
import * as Font from "../src/Font";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";
import { render, renderExit } from "./support/framebuffer";

/**
 * Font resolution at render (resource-loaders / font-loading / motion-renderer
 * specs): missing loader is a loud defect naming the font; a caller-provided
 * loader under the reserved "sans-serif" id overrides the built-in default;
 * the default font is auto-provided for bare text.
 *
 * Real TrueType bytes are fetched ONCE up front (same convention as the
 * thorvg package's font tests); every test after that runs with fetch
 * patched, so the tests themselves prove which loading path was taken.
 */

const realFetch = globalThis.fetch;
let ttfBytes: Uint8Array;
let ttfPath: string;

beforeAll(async () => {
	const response = await realFetch(Font.DEFAULT_FONT_URL);
	ttfBytes = new Uint8Array(await response.arrayBuffer());
	// on disk too: the override test loads through a Node fs loader — the
	// export path's shape (no URL anywhere)
	ttfPath = join(await mkdtemp(join(tmpdir(), "effect-motion-font-")), "f.ttf");
	await writeFile(ttfPath, ttfBytes);
}, 60_000);

afterAll(() => {
	globalThis.fetch = realFetch;
});

const frameWith = (
	instances: Record<string, { data: unknown; entity: unknown }>,
): Scene.Frame<never> =>
	({
		instances: {
			...instances,
			root: {
				data: Shapes.Group.data.make({ children: Object.keys(instances) }),
				entity: Shapes.Group,
			},
		},
		root: "root",
		frameRate: 60,
		width: 300,
		height: 120,
		backgroundColor: Color.hex("#16161d"),
		camera: Camera.identity(300),
	}) as Scene.Frame<never>;

const textFrame = (fontId: string) =>
	frameWith({
		t: {
			data: Shapes.Text.data.make({
				text: "MMMM",
				x: 20,
				y: 70,
				fontSize: 40,
				fill: Color.hex("#ffffff"),
				fontFamily: Font.schema.make({ id: fontId }),
			}),
			entity: Shapes.Text,
		},
	});

const anyPaintedIn = (
	r: { isPainted: (x: number, y: number) => boolean },
	x0: number,
	y0: number,
	x1: number,
	y1: number,
): boolean => {
	for (let y = y0; y < y1; y += 2) {
		for (let x = x0; x < x1; x += 2) {
			if (r.isPainted(x, y)) {
				return true;
			}
		}
	}
	return false;
};

describe("font resolution at render", () => {
	it("an unprovided font loader dies with a defect naming the font", async () => {
		// offline: the defect fires before any bytes are touched
		globalThis.fetch = (() =>
			Promise.reject(new Error("no fetch in this test"))) as typeof fetch;
		const exit = await renderExit(textFrame("Ghost"));
		expect(exit._tag).toBe("Failure");
		expect(String((exit as { cause?: unknown }).cause)).toContain('"Ghost"');
	});

	it("a caller loader under the reserved sans-serif id overrides the default", async () => {
		// fetch stays broken: success proves the caller's bytes were used and
		// the built-in default fetch was never attempted
		globalThis.fetch = (() =>
			Promise.reject(new Error("no fetch in this test"))) as typeof fetch;
		const r = await render(textFrame(Font.defaultFont.id), {
			resources: Font.layer(
				Font.Font("sans-serif"),
				// a Node fs loader — bytes from disk, no URL involved
				Effect.promise(() =>
					readFile(ttfPath).then((buffer) => new Uint8Array(buffer)),
				),
			),
		});
		expect(anyPaintedIn(r, 0, 0, 300, 120)).toBe(true);
	});

	it("the default font is auto-provided for bare text", async () => {
		// serve the cached real bytes when the default URL is requested — the
		// render path may fetch it (module-cached across renders)
		globalThis.fetch = ((input: RequestInfo | URL) => {
			if (String(input) === Font.DEFAULT_FONT_URL) {
				return Promise.resolve(new Response(ttfBytes.slice(), { status: 200 }));
			}
			return Promise.reject(new Error(`unexpected fetch: ${String(input)}`));
		}) as typeof fetch;
		// bare Text: fontFamily comes from the schema constructor default
		const r = await render(
			frameWith({
				t: {
					data: Shapes.Text.data.make({
						text: "MMMM",
						x: 20,
						y: 70,
						fontSize: 40,
						fill: Color.hex("#ffffff"),
					}),
					entity: Shapes.Text,
				},
			}),
		);
		expect(anyPaintedIn(r, 0, 0, 300, 120)).toBe(true);
	});
});
