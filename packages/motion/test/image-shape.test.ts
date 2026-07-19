import { Effect, type Layer } from "effect";
import { beforeAll, describe, expect, it } from "vitest";
import * as Camera from "../src/Camera";
import * as Color from "../src/Color";
import * as ImageResource from "../src/Image";
import type * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";
import { render, renderExit } from "./support/framebuffer";

/**
 * Shapes.Image render path (image-assets spec): loader-provided bytes decode
 * once into a session-owned picture, declared vs natural size, loud defect
 * for an unprovided loader, opacity.
 */

const Logo = ImageResource.Image("logo");
let greenPng: Uint8Array;
let logoLayer: Layer.Layer<ImageResource.ImageLoader<"logo">>;

beforeAll(async () => {
	// an 8×8 solid green PNG built in-memory — no fetch anywhere in this file
	const { encodePng } = await import("@effect-motion/thorvg/png");
	const rgba = new Uint8Array(8 * 8 * 4);
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i + 1] = 255;
		rgba[i + 3] = 255;
	}
	greenPng = encodePng(rgba, 8, 8);
	logoLayer = ImageResource.layer(
		Logo,
		Effect.sync(() => greenPng.slice()),
	);
});

const logoRef = ImageResource.schema.make({ id: "logo" });

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
		width: 200,
		height: 100,
		backgroundColor: Color.hex("#16161d"),
		camera: Camera.identity(200),
	}) as Scene.Frame<never>;

describe("Shapes.Image rendering", () => {
	it("declared size draws exactly that footprint at (x, y)", async () => {
		const r = await render(
			frameWith({
				img: {
					data: Shapes.Image.data.make({
						image: logoRef,
						x: 50,
						y: 30,
						width: 40,
						height: 20,
					}),
					entity: Shapes.Image,
				},
			}),
			{ resources: logoLayer },
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
					data: Shapes.Image.data.make({ image: logoRef, x: 20, y: 20 }),
					entity: Shapes.Image,
				},
			}),
			{ resources: logoLayer },
		);
		expect(r.isPainted(24, 24)).toBe(true); // inside the natural 8×8
		expect(r.isPainted(30, 24)).toBe(false); // just past its right edge
	});

	it("an unprovided image loader dies with a defect naming the id", async () => {
		const exit = await renderExit(
			frameWith({
				img: {
					data: Shapes.Image.data.make({
						image: ImageResource.schema.make({ id: "undeclared" }),
						x: 20,
						y: 20,
						width: 40,
						height: 40,
					}),
					entity: Shapes.Image,
				},
			}),
			{ resources: logoLayer },
		);
		expect(exit._tag).toBe("Failure");
		expect(String((exit as { cause?: unknown }).cause)).toContain(
			'"undeclared"',
		);
	});

	it("opacity applies to the picture", async () => {
		const opaque = await render(
			frameWith({
				img: {
					data: Shapes.Image.data.make({
						image: logoRef,
						x: 0,
						y: 0,
						width: 60,
						height: 60,
					}),
					entity: Shapes.Image,
				},
			}),
			{ resources: logoLayer },
		);
		const faded = await render(
			frameWith({
				img: {
					data: Shapes.Image.data.make({
						image: logoRef,
						x: 0,
						y: 0,
						width: 60,
						height: 60,
						opacity: 0.3,
					}),
					entity: Shapes.Image,
				},
			}),
			{ resources: logoLayer },
		);
		const [, gOpaque] = opaque.at(30, 30);
		const [, gFaded] = faded.at(30, 30);
		expect(gOpaque).toBeGreaterThan(200);
		expect(gFaded).toBeGreaterThan(20);
		expect(gFaded).toBeLessThan(gOpaque - 80);
	});
});
