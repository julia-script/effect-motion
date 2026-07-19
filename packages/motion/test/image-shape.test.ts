import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Color from "../src/Color";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";
import { render } from "./support/framebuffer";

/**
 * Shapes.Image render path (image-assets spec): session-decoded picture,
 * declared vs natural size, soft skip for missing assets, opacity.
 */

// an 8×8 solid green PNG, served from memory via a patched fetch — same
// minimal-PNG approach as the thorvg package tests, without importing its
// internals: precomputed by packages/thorvg's encodePng for an 8×8 green fill
const GREEN_URL = "https://images.test/green.png";
const realFetch = globalThis.fetch;
let greenPng: Uint8Array;

beforeAll(async () => {
	const { encodePng } = await import("@effect-motion/thorvg/png");
	const rgba = new Uint8Array(8 * 8 * 4);
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i + 1] = 255;
		rgba[i + 3] = 255;
	}
	greenPng = encodePng(rgba, 8, 8);
	globalThis.fetch = ((input: RequestInfo | URL) => {
		if (String(input) === GREEN_URL) {
			return Promise.resolve(new Response(greenPng.slice(), { status: 200 }));
		}
		return Promise.resolve(new Response("nope", { status: 404 }));
	}) as typeof fetch;
});

afterAll(() => {
	globalThis.fetch = realFetch;
});

type Used = typeof Shapes.Image | typeof Shapes.Circle | typeof Shapes.Group;

const frameWith = (
	instances: Record<string, { data: unknown; entity: Used }>,
): Scene.Frame<Used> =>
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
		width: 200,
		height: 100,
		backgroundColor: Color.hex("#16161d"),
		camera: Camera.identity(200),
	}) as Scene.Frame<Used>;

const images = { logo: GREEN_URL };

describe("Shapes.Image rendering", () => {
	it("declared size draws exactly that footprint at (x, y)", async () => {
		const r = await render(
			frameWith({
				img: {
					data: Shapes.Image.data.make({
						image: "logo",
						x: 50,
						y: 30,
						width: 40,
						height: 20,
					}),
					entity: Shapes.Image,
				},
			}),
			{ images },
		);
		expect(r.isPainted(70, 40)).toBe(true); // center of 40×20 at (50,30)
		expect(r.isPainted(52, 32)).toBe(true); // inside top-left
		expect(r.isPainted(48, 40)).toBe(false); // left of the image
		expect(r.isPainted(92, 40)).toBe(false); // right of the image
		expect(r.isPainted(70, 52)).toBe(false); // below the image
		// the painted pixel is the source's green
		const [red, g] = r.at(70, 40);
		expect(g).toBeGreaterThan(200);
		expect(red).toBeLessThan(50);
	});

	it("no declared size draws at the natural size", async () => {
		const r = await render(
			frameWith({
				img: {
					data: Shapes.Image.data.make({ image: "logo", x: 20, y: 20 }),
					entity: Shapes.Image,
				},
			}),
			{ images },
		);
		expect(r.isPainted(24, 24)).toBe(true); // inside the natural 8×8
		expect(r.isPainted(30, 24)).toBe(false); // just past its right edge
	});

	it("a missing asset paints nothing; siblings render", async () => {
		const r = await render(
			frameWith({
				img: {
					data: Shapes.Image.data.make({
						image: "undeclared",
						x: 20,
						y: 20,
						width: 40,
						height: 40,
					}),
					entity: Shapes.Image,
				},
				c: {
					data: Shapes.Circle.data.make({ x: 150, y: 50, radius: 20 }),
					entity: Shapes.Circle,
				},
			}),
			{ images },
		);
		expect(r.isPainted(40, 40)).toBe(false); // image footprint empty
		expect(r.isPainted(150, 50)).toBe(true); // circle still painted
	});

	it("opacity applies to the picture", async () => {
		const opaque = await render(
			frameWith({
				img: {
					data: Shapes.Image.data.make({
						image: "logo",
						x: 0,
						y: 0,
						width: 60,
						height: 60,
					}),
					entity: Shapes.Image,
				},
			}),
			{ images },
		);
		const faded = await render(
			frameWith({
				img: {
					data: Shapes.Image.data.make({
						image: "logo",
						x: 0,
						y: 0,
						width: 60,
						height: 60,
						opacity: 0.3,
					}),
					entity: Shapes.Image,
				},
			}),
			{ images },
		);
		const [, gOpaque] = opaque.at(30, 30);
		const [, gFaded] = faded.at(30, 30);
		expect(gOpaque).toBeGreaterThan(200);
		expect(gFaded).toBeGreaterThan(20);
		expect(gFaded).toBeLessThan(gOpaque - 80);
	});
});
