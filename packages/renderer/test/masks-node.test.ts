import {
	Renderer as Gpu,
	MaskMaterial,
	RenderTarget,
} from "@effect-motion/three";
import * as NodeGpu from "@effect-motion/three/node";
import { Effect } from "effect";
import * as Exit from "effect/Exit";
import * as Stream from "effect/Stream";
import { Color, Entity, Image, Scene } from "effect-motion";
import { describe, expect, it } from "vitest";
import { builtinRegistry } from "../src/Builtins.js";
import * as NodeRenderer from "../src/node.js";
import * as BrowserRenderer from "../src/Renderer.js";
import * as Sync from "../src/Sync.js";
import { unreachable } from "./support/raise.js";

type Frame = Parameters<typeof NodeRenderer.renderToRgba>[1];

const frameOf = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Frame> => {
	const frames = await Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, {
				width: 64,
				height: 64,
				backgroundColor: Color.rgba(0, 0, 0),
			}) as never,
			{},
		).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<Frame>,
			never
		>,
	);
	return [...frames].at(-1) ?? unreachable();
};

const framesOf = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Frame[]> => {
	const frames = await Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, {
				width: 64,
				height: 64,
				backgroundColor: Color.rgba(0, 0, 0),
			}) as never,
			{},
		).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<Frame>,
			never
		>,
	);
	return [...frames];
};

const pixelsOf = (frame: Frame, layer?: any) =>
	Effect.runPromise(
		Effect.scoped(
			NodeRenderer.make({ width: 64, height: 64 }).pipe(
				Effect.flatMap((renderer) =>
					NodeRenderer.renderToRgba(renderer, frame),
				),
			),
		).pipe(
			layer === undefined ? (effect) => effect : Effect.provide(layer),
		) as Effect.Effect<Uint8Array, never>,
	);

const pixel = (
	rgba: Uint8Array,
	x: number,
	y: number,
): [number, number, number] => {
	const offset = ((32 - y) * 64 + (32 + x)) * 4;
	return [rgba[offset] ?? 0, rgba[offset + 1] ?? 0, rgba[offset + 2] ?? 0];
};

describe("headless alpha masks", () => {
	it("uses projected source alpha without painting source RGB", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 50,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: -10 }),
				radius: 12,
				fillColor: Color.rgba(255, 0, 0, 0.5),
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		const inside = pixel(rgba, -10, 0);
		const outside = pixel(rgba, 15, 0);
		expect(inside[2]).toBeGreaterThan(100);
		expect(inside[2]).toBeLessThan(230);
		expect(inside[0]).toBeLessThan(30);
		expect(outside[2]).toBeLessThan(30);
	}, 30_000);

	it("keeps 254/255 mask coverage fractional over a translucent layer", async () => {
		const makeFrame = (alpha: number) =>
			frameOf(function* () {
				yield* Scene.instantiate("Rect", {
					position: Entity.vec3({ z: -20 }),
					width: 40,
					height: 40,
					fillColor: Color.rgba(255, 0, 0, 0.9),
				});
				const target = yield* Scene.instantiate("Rect", {
					width: 40,
					height: 40,
					fillColor: Color.rgba(0, 0, 255),
				});
				const source = yield* Scene.instantiate("Circle", {
					radius: 20,
					fillColor: Color.rgba(255, 255, 255, alpha),
				});
				yield* Scene.setMask(target, source);
				yield* Scene.tick;
			});
		const opaque = pixel(await pixelsOf(await makeFrame(1)), 0, 0);
		const fractional = pixel(await pixelsOf(await makeFrame(254 / 255)), 0, 0);
		expect(opaque[0]).toBeLessThan(3);
		// The red translucent sibling is behind the blue target. Its color
		// survives only when the near-opaque target blends without writing depth.
		expect(fractional[0]).toBeGreaterThan(5);
		expect(fractional[2]).toBeGreaterThan(250);
	}, 30_000);

	it("ignores source RGB and treats an invisible source as zero coverage", async () => {
		const makeFrame = (color: Color.Color, visible = true) =>
			frameOf(function* () {
				const target = yield* Scene.instantiate("Rect", {
					width: 40,
					height: 30,
					fillColor: Color.rgba(0, 0, 255),
				});
				const source = yield* Scene.instantiate("Circle", {
					radius: 12,
					fillColor: color,
					visible,
				});
				yield* Scene.setMask(target, source);
				yield* Scene.tick;
			});
		const red = await pixelsOf(await makeFrame(Color.rgba(255, 0, 0, 0.5)));
		const green = await pixelsOf(await makeFrame(Color.rgba(0, 255, 0, 0.5)));
		const hidden = await pixelsOf(
			await makeFrame(Color.rgba(255, 0, 0, 0.5), false),
		);
		expect(Math.abs(pixel(red, 0, 0)[2] - pixel(green, 0, 0)[2])).toBeLessThan(
			3,
		);
		expect(pixel(hidden, 0, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("inverse coverage preserves the target color and restores holes", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 50,
				height: 30,
				fillColor: Color.rgba(0, 255, 0),
			});
			const source = yield* Scene.instantiate("Circle", {
				radius: 12,
				fillColor: Color.rgba(255, 0, 0, 0.5),
			});
			yield* Scene.setMask(target, source, { mode: "inverse" });
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		expect(pixel(rgba, 0, 0)[1]).toBeGreaterThan(100);
		expect(pixel(rgba, 0, 0)[1]).toBeLessThan(230);
		expect(pixel(rgba, 20, 0)[1]).toBeGreaterThan(230);
		expect(pixel(rgba, 0, 0)[0]).toBeLessThan(30);
	}, 30_000);

	it("uses glyph ink as source coverage", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 50,
				height: 50,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Text", {
				text: "I",
				fontSize: 35,
				position: Entity.vec3({ x: -10, y: -10 }),
				fillColor: Color.rgba(255, 0, 0, 0.5),
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		let blue = 0;
		let red = 0;
		let brightestBlue = 0;
		for (let i = 0; i < rgba.length; i += 4) {
			if ((rgba[i + 2] ?? 0) > 80) blue++;
			if ((rgba[i] ?? 0) > 80) red++;
			brightestBlue = Math.max(brightestBlue, rgba[i + 2] ?? 0);
		}
		expect(blue).toBeGreaterThan(10);
		expect(blue).toBeLessThan(500);
		expect(brightestBlue).toBeLessThan(230);
		expect(red).toBe(0);
	}, 30_000);

	it("uses transparent image pixels and source opacity", async () => {
		const pixels = new Uint8Array(4 * 4 * 4);
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const i = (y * 4 + x) * 4;
				pixels[i] = 255;
				pixels[i + 3] = x < 2 ? 255 : 0;
			}
		}
		const sourceImage = Image.Image("mask-image-test");
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 40,
				height: 40,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Image", {
				image: yield* sourceImage,
				width: 40,
				height: 40,
				opacity: 0.5,
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(
			frame,
			Image.layer(
				sourceImage,
				Effect.succeed(NodeRenderer.encodePng(pixels, 4, 4)),
			),
		);
		expect(pixel(rgba, -10, 0)[2]).toBeGreaterThan(100);
		expect(pixel(rgba, -10, 0)[2]).toBeLessThan(230);
		expect(pixel(rgba, 10, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("clips glyph target ink at its own depth", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Text", {
				text: "MASK",
				fontSize: 26,
				position: Entity.vec3({ x: -30, y: -8 }),
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", {
				radius: 13,
				fillColor: Color.rgba(255, 0, 0),
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		let blue = 0;
		for (let y = -12; y <= 12; y++) {
			for (let x = -12; x <= 12; x++) {
				if (pixel(rgba, x, y)[2] > 80) blue++;
			}
		}
		expect(blue).toBeGreaterThan(10);
		expect(pixel(rgba, -26, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("multiplies inherited Group and direct child factors once", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 50,
				height: 24,
				fillColor: Color.rgba(0, 0, 255),
			});
			const group = yield* Scene.instantiate("Group", { children: [target] });
			const left = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: -6 }),
				radius: 12,
				fillColor: Color.rgba(255, 0, 0),
			});
			const right = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: 6 }),
				radius: 12,
				fillColor: Color.rgba(255, 0, 0),
			});
			yield* Scene.setMask(group, left);
			yield* Scene.setMask(target, right);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		expect(pixel(rgba, 0, 0)[2]).toBeGreaterThan(230);
		expect(pixel(rgba, -12, 0)[2]).toBeLessThan(30);
		expect(pixel(rgba, 12, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("uses a world-unit stroke as source coverage", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 50,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Line", {
				start: Entity.vec3({ x: -20 }),
				end: Entity.vec3({ x: 20 }),
				strokeWidth: 8,
				strokeColor: Color.rgba(255, 0, 0, 0.5),
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		expect(pixel(rgba, 0, 0)[2]).toBeGreaterThan(100);
		expect(pixel(rgba, 0, 0)[2]).toBeLessThan(230);
		expect(pixel(rgba, 0, 10)[2]).toBeLessThan(30);
		expect(pixel(rgba, 0, 0)[0]).toBeLessThan(30);
	}, 30_000);

	it("clips a stroke target at its native line depth", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Line", {
				start: Entity.vec3({ x: -20 }),
				end: Entity.vec3({ x: 20 }),
				strokeWidth: 8,
				strokeColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: -10 }),
				width: 20,
				height: 20,
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		expect(pixel(rgba, -10, 0)[2]).toBeGreaterThan(230);
		expect(pixel(rgba, 10, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("preserves transparent pixels of a masked Image target", async () => {
		const sourcePixels = new Uint8Array(4 * 4 * 4);
		for (let y = 0; y < 4; y++) {
			for (let x = 0; x < 4; x++) {
				const i = (y * 4 + x) * 4;
				sourcePixels[i + 2] = 255;
				sourcePixels[i + 3] = x < 2 ? 255 : 0;
			}
		}
		const image = Image.Image("mask-target-test");
		const frame = await frameOf(function* () {
			yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ z: -20 }),
				width: 40,
				height: 40,
				fillColor: Color.rgba(0, 255, 0),
			});
			const target = yield* Scene.instantiate("Image", {
				image: yield* image,
				width: 40,
				height: 40,
			});
			const source = yield* Scene.instantiate("Circle", { radius: 30 });
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(
			frame,
			Image.layer(
				image,
				Effect.succeed(NodeRenderer.encodePng(sourcePixels, 4, 4)),
			),
		);
		expect(pixel(rgba, -10, 0)[2]).toBeGreaterThan(230);
		expect(pixel(rgba, 10, 0)[1]).toBeGreaterThan(230);
	}, 30_000);

	it("keeps near and far translucent Path subpaths around an opaque sibling", async () => {
		const frame = await frameOf(function* () {
			const square = (z: number) => [
				{ _tag: "M" as const, x: -15, y: -15, z },
				{ _tag: "L" as const, x: 15, y: -15, z },
				{ _tag: "L" as const, x: 15, y: 15, z },
				{ _tag: "L" as const, x: -15, y: 15, z },
				{ _tag: "Z" as const },
			];
			const target = yield* Scene.instantiate("Path", {
				commands: [
					{ _tag: "M", x: -15, y: -15, z: -80 },
					...square(-80).slice(1),
					...square(80),
				],
				fillColor: Color.rgba(255, 0, 0, 0.5),
			});
			yield* Scene.instantiate("Rect", {
				width: 28,
				height: 28,
				fillColor: Color.rgba(0, 255, 0),
			});
			const source = yield* Scene.instantiate("Circle", {
				radius: 25,
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		const center = pixel(rgba, 0, 0);
		expect(center[0]).toBeGreaterThan(140);
		expect(center[0]).toBeLessThan(225);
		expect(center[1]).toBeGreaterThan(140);
	}, 30_000);

	it("does not bake an ancestor mask into its child source coverage", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 30,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const childSource = yield* Scene.instantiate("Circle", {
				radius: 18,
				opacity: 0.5,
			});
			const group = yield* Scene.instantiate("Group", {
				children: [target, childSource],
			});
			const outerSource = yield* Scene.instantiate("Circle", {
				radius: 18,
				opacity: 0.5,
			});
			yield* Scene.setMask(group, outerSource);
			yield* Scene.setMask(target, childSource);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		// 0.5 × 0.5 coverage in linear light encodes near 137 sRGB.
		expect(pixel(rgba, 0, 0)[2]).toBeGreaterThan(120);
		expect(pixel(rgba, 0, 0)[2]).toBeLessThan(160);
	}, 30_000);

	it("reuses coverage targets and releases them on clear and close", async () => {
		const frames = await framesOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 30,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", {
				radius: 12,
				fillColor: Color.rgba(255, 0, 0),
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
			yield* Scene.clearMask(target);
			yield* Scene.tick;
		});
		const masked =
			frames.find((frame) => Object.keys(frame.masks ?? {}).length > 0) ??
			unreachable();
		const cleared = frames.at(-1) ?? unreachable();
		let sync: NodeRenderer.NodeRenderer["sync"] | undefined;
		const result = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 64, height: 64 }).pipe(
					Effect.flatMap((renderer) => {
						sync = renderer.sync;
						return NodeRenderer.renderToRgba(renderer, masked).pipe(
							Effect.flatMap(() => {
								const targetRef =
									[...renderer.sync.maskTargets.values()][0]?.rt ??
									unreachable();
								const variants = renderer.sync.maskDrawables.size;
								return NodeRenderer.renderToRgba(renderer, masked).pipe(
									Effect.flatMap(() => {
										const reused =
											[...renderer.sync.maskTargets.values()][0]?.rt ===
											targetRef;
										return NodeRenderer.renderToRgba(renderer, cleared).pipe(
											Effect.map((rgba) => ({
												reused,
												variants,
												remaining: renderer.sync.maskTargets.size,
												rgba,
											})),
										);
									}),
								);
							}),
						);
					}),
				),
			) as Effect.Effect<
				{
					reused: boolean;
					variants: number;
					remaining: number;
					rgba: Uint8Array;
				},
				never
			>,
		);
		expect(result.reused).toBe(true);
		expect(result.variants).toBeGreaterThan(0);
		expect(result.remaining).toBe(0);
		expect(sync?.maskTargets.size).toBe(0);
		expect(sync?.maskDrawables.size).toBe(0);
		expect(pixel(result.rgba, 0, 0)[0]).toBeGreaterThan(230);
	}, 30_000);

	it("disposes masked Path geometry and variants once on rebuild and teardown", async () => {
		const frames = await framesOf(function* () {
			const target = yield* Scene.instantiate("Path", {
				commands: [
					{ _tag: "M", x: -8, y: -8 },
					{ _tag: "L", x: 8, y: -8 },
					{ _tag: "L", x: 0, y: 8 },
					{ _tag: "Z" },
				],
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", { radius: 20 });
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
			yield* Scene.update(target, (data) => ({
				...data,
				position: Entity.vec3({ x: 3 }),
			}));
			yield* Scene.tick;
		});
		const masked = frames.filter(
			(frame) => Object.keys(frame.masks ?? {}).length > 0,
		);
		const firstFrame = masked[0] ?? unreachable();
		const secondFrame = masked.at(-1) ?? unreachable();
		const result = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const renderer = yield* NodeRenderer.make({ width: 64, height: 64 });
					yield* NodeRenderer.renderToRgba(renderer, firstFrame);
					const first =
						[...renderer.sync.maskDrawables.values()][0] ?? unreachable();
					const observe = (entry: typeof first) => {
						const counts = {
							geometry: 0,
							material: 0,
							opaque: 0,
							fractional: 0,
						};
						entry.source.geometry.addEventListener(
							"dispose",
							() => counts.geometry++,
						);
						entry.material.addEventListener("dispose", () => counts.material++);
						entry.variants["~three.opaque"].addEventListener(
							"dispose",
							() => counts.opaque++,
						);
						entry.variants["~three.fractional"].addEventListener(
							"dispose",
							() => counts.fractional++,
						);
						return counts;
					};
					const old = observe(first);
					yield* NodeRenderer.renderToRgba(renderer, secondFrame);
					const second =
						[...renderer.sync.maskDrawables.values()][0] ?? unreachable();
					const current = observe(second);
					return {
						old,
						current,
						afterUpdate: { ...old },
						beforeTeardown: { ...current },
						shared: first.opaque.geometry === first.source.geometry,
						rebuilt: first.source.geometry !== second.source.geometry,
					};
				}),
			),
		);
		expect(result.shared).toBe(true);
		expect(result.rebuilt).toBe(true);
		expect(result.afterUpdate).toEqual({
			geometry: 1,
			material: 1,
			opaque: 1,
			fractional: 1,
		});
		expect(result.beforeTeardown).toEqual({
			geometry: 0,
			material: 0,
			opaque: 0,
			fractional: 0,
		});
		expect(result.old).toEqual(result.afterUpdate);
		expect(result.current).toEqual({
			geometry: 1,
			material: 1,
			opaque: 1,
			fractional: 1,
		});
	}, 30_000);

	it("resolves child masks inside a composition and masks its parent plane", async () => {
		const inner = Scene.make(
			function* () {
				const target = yield* Scene.instantiate("Rect", {
					width: 50,
					height: 40,
					fillColor: Color.rgba(0, 0, 255),
				});
				const source = yield* Scene.instantiate("Circle", {
					radius: 16,
				});
				yield* Scene.setMask(target, source);
				yield* Scene.tick;
			} as never,
			{ width: 64, height: 64 },
		);
		const frame = await frameOf(function* () {
			const mounted = yield* Scene.play(inner as never);
			const outerSource = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: -8 }),
				width: 32,
				height: 50,
			});
			yield* Scene.setMask(mounted.group, outerSource);
			yield* mounted.finished;
		});
		const rgba = await pixelsOf(frame);
		expect(pixel(rgba, -8, 0)[2]).toBeGreaterThan(180);
		expect(pixel(rgba, 8, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("keeps a masked child comp sharp inside and applies only parent focus", async () => {
		const inner = Scene.make(
			function* () {
				const target = yield* Scene.instantiate("Rect", {
					width: 50,
					height: 40,
					fillColor: Color.rgba(0, 0, 255),
				});
				const source = yield* Scene.instantiate("Circle", { radius: 14 });
				yield* Scene.setMask(target, source);
				yield* Scene.tick;
			} as never,
			{ width: 64, height: 64 },
		);
		const frame = await frameOf(function* () {
			const mounted = yield* Scene.play(inner as never);
			yield* mounted.finished;
		});
		const compId = Object.keys(frame.comps)[0] ?? unreachable();
		const comp = frame.comps[compId] ?? unreachable();
		const childOpen = {
			...frame,
			comps: {
				...frame.comps,
				[compId]: {
					...comp,
					camera: { ...comp.camera, aperture: 20, focusDistance: 20 },
				},
			},
		};
		const plain = await pixelsOf(frame);
		const childLens = await pixelsOf(childOpen);
		for (const x of [0, 12, 18]) {
			expect(
				Math.abs(pixel(plain, x, 0)[2] - pixel(childLens, x, 0)[2]),
			).toBeLessThan(5);
		}
		const parentOpen = {
			...frame,
			camera: { ...frame.camera, aperture: 15, focusDistance: 20 },
		};
		const focused = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 64, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToRgba(renderer, parentOpen).pipe(
							Effect.map((rgba) => ({
								rgba,
								parentFocus: renderer.dofChain !== null,
							})),
						),
					),
				),
			) as Effect.Effect<{ rgba: Uint8Array; parentFocus: boolean }, never>,
		);
		expect(focused.parentFocus).toBe(true);
		expect(pixel(focused.rgba, 0, 0)[2]).toBeGreaterThan(50);
	}, 30_000);

	it("excludes a nested source root from its enclosing Group source", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 60,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const parked = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: 100 }),
				width: 10,
				height: 10,
			});
			const left = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: -14 }),
				radius: 10,
			});
			const right = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: 14 }),
				radius: 10,
			});
			const sourceGroup = yield* Scene.instantiate("Group", {
				children: [left, right],
			});
			yield* Scene.setMask(parked, right);
			yield* Scene.setMask(target, sourceGroup);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		expect(pixel(rgba, -14, 0)[2]).toBeGreaterThan(230);
		expect(pixel(rgba, 14, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("evaluates a mask on a source before using that source", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 60,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", { radius: 20 });
			const limiter = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: -10 }),
				width: 20,
				height: 40,
			});
			yield* Scene.setMask(source, limiter);
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const rgba = await pixelsOf(frame);
		expect(pixel(rgba, -10, 0)[2]).toBeGreaterThan(230);
		expect(pixel(rgba, 10, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("keeps Hud mask coverage fixed when the world camera moves", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 40,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", { radius: 12 });
			yield* Scene.instantiate("Hud", { children: [target, source] });
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const moved = {
			...frame,
			camera: { ...frame.camera, x: frame.camera.x + 30 },
		};
		const first = await pixelsOf(frame);
		const second = await pixelsOf(moved);
		expect(pixel(first, 0, 0)[2]).toBeGreaterThan(230);
		expect(pixel(second, 0, 0)[2]).toBeGreaterThan(230);
		expect(pixel(second, 18, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("projects world mask coverage through a moved camera", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 50,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", { radius: 10 });
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const moved = {
			...frame,
			camera: { ...frame.camera, x: frame.camera.x + 20 },
		};
		const rgba = await pixelsOf(moved);
		expect(pixel(rgba, -20, 0)[2]).toBeGreaterThan(230);
		expect(pixel(rgba, 0, 0)[2]).toBeLessThan(30);
	}, 30_000);

	it("accepts a legacy frame without masks and allocates no mask resources", async () => {
		const frame = await frameOf(function* () {
			yield* Scene.instantiate("Circle", {
				radius: 12,
				fillColor: Color.rgba(0, 0, 255),
			});
			yield* Scene.tick;
		});
		const { masks: _masks, ...legacy } = frame;
		const result = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 64, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToRgba(renderer, legacy).pipe(
							Effect.map((rgba) => ({
								rgba,
								targets: renderer.sync.maskTargets.size,
								variants: renderer.sync.maskDrawables.size,
							})),
						),
					),
				),
			) as Effect.Effect<
				{ rgba: Uint8Array; targets: number; variants: number },
				never
			>,
		);
		expect(pixel(result.rgba, 0, 0)[2]).toBeGreaterThan(230);
		expect(result.targets).toBe(0);
		expect(result.variants).toBe(0);
	}, 30_000);

	it("runs the browser adapter mask path through Dawn", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 40,
				height: 30,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", {
				radius: 12,
				opacity: 0.5,
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const browser = await Effect.runPromise(
			Effect.scoped(
				Effect.gen(function* () {
					const { canvas } = NodeGpu.stubCanvas(64, 64);
					const renderer = yield* BrowserRenderer.make({
						canvas: canvas as unknown as HTMLCanvasElement,
						width: 64,
						height: 64,
					});
					const target = yield* RenderTarget.make(64, 64);
					Gpu.setRenderTarget(renderer.gpu, target);
					yield* BrowserRenderer.resolveResources(renderer, frame);
					yield* BrowserRenderer.syncFrame(renderer, frame);
					yield* BrowserRenderer.render(renderer);
					const pixels = yield* Gpu.readRenderTarget(
						renderer.gpu,
						target,
						64,
						64,
					);
					const maskTarget =
						[...renderer.sync.maskTargets.values()][0]?.rt ?? unreachable();
					const resized = yield* RenderTarget.make(80, 80);
					BrowserRenderer.setViewport(renderer, 80, 80, 1);
					Gpu.setRenderTarget(renderer.gpu, resized);
					yield* BrowserRenderer.syncFrame(renderer, {
						...frame,
						width: 80,
						height: 80,
					});
					yield* BrowserRenderer.render(renderer);
					return {
						pixels,
						retainedOnResize:
							[...renderer.sync.maskTargets.values()][0]?.rt === maskTarget,
						maskWidth: RenderTarget.width(maskTarget),
					};
				}),
			) as Effect.Effect<
				{ pixels: Uint8Array; retainedOnResize: boolean; maskWidth: number },
				never
			>,
		);
		expect(pixel(browser.pixels, 0, 0)[2]).toBeGreaterThan(100);
		expect(pixel(browser.pixels, 0, 0)[2]).toBeLessThan(230);
		expect(pixel(browser.pixels, 20, 0)[2]).toBeLessThan(30);
		expect(browser.retainedOnResize).toBe(true);
		expect(browser.maskWidth).toBe(80);
	}, 30_000);

	it("updates source coverage on the next frame without reallocating its target", async () => {
		const frames = await framesOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 50,
				height: 25,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: -12 }),
				radius: 8,
			});
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
			yield* Scene.update(source, (data) => ({
				...data,
				position: Entity.vec3({ x: 12 }),
			}));
			yield* Scene.tick;
		});
		const masked = frames.filter(
			(frame) => Object.keys(frame.masks ?? {}).length > 0,
		);
		const first = masked[0] ?? unreachable();
		const second = masked.at(-1) ?? unreachable();
		const result = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 64, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToRgba(renderer, first).pipe(
							Effect.flatMap((a) => {
								const target = [...renderer.sync.maskTargets.values()][0]?.rt;
								return NodeRenderer.renderToRgba(renderer, second).pipe(
									Effect.map((b) => ({
										a,
										b,
										reused:
											[...renderer.sync.maskTargets.values()][0]?.rt === target,
									})),
								);
							}),
						),
					),
				),
			) as Effect.Effect<
				{ a: Uint8Array; b: Uint8Array; reused: boolean },
				never
			>,
		);
		expect(pixel(result.a, -12, 0)[2]).toBeGreaterThan(230);
		expect(pixel(result.a, 12, 0)[2]).toBeLessThan(30);
		expect(pixel(result.b, -12, 0)[2]).toBeLessThan(30);
		expect(pixel(result.b, 12, 0)[2]).toBeGreaterThan(230);
		expect(result.reused).toBe(true);
	}, 30_000);

	it("moves target geometry independently under a stationary source", async () => {
		const frames = await framesOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				position: Entity.vec3({ x: -6 }),
				width: 6,
				height: 12,
				fillColor: Color.rgba(0, 0, 255),
			});
			const source = yield* Scene.instantiate("Circle", { radius: 12 });
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
			yield* Scene.update(target, (data) => ({
				...data,
				position: Entity.vec3({ x: 6 }),
			}));
			yield* Scene.tick;
		});
		const masked = frames.filter(
			(frame) => Object.keys(frame.masks ?? {}).length > 0,
		);
		const first = await pixelsOf(masked[0] ?? unreachable());
		const second = await pixelsOf(masked.at(-1) ?? unreachable());
		expect(pixel(first, -6, 0)[2]).toBeGreaterThan(230);
		expect(pixel(first, 6, 0)[2]).toBeLessThan(30);
		expect(pixel(second, -6, 0)[2]).toBeLessThan(30);
		expect(pixel(second, 6, 0)[2]).toBeGreaterThan(230);
	}, 30_000);

	it("replaces a source and releases the previous coverage target", async () => {
		const frames = await framesOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 50,
				height: 25,
				fillColor: Color.rgba(0, 0, 255),
			});
			const left = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: -12 }),
				radius: 8,
				fillColor: Color.rgba(0, 0, 0),
			});
			const right = yield* Scene.instantiate("Circle", {
				position: Entity.vec3({ x: 12 }),
				radius: 8,
				fillColor: Color.rgba(0, 0, 0),
			});
			yield* Scene.setMask(target, left);
			yield* Scene.tick;
			yield* Scene.setMask(target, right);
			yield* Scene.tick;
		});
		const masked = frames.filter(
			(frame) => Object.keys(frame.masks ?? {}).length > 0,
		);
		const first = masked[0] ?? unreachable();
		const second = masked.at(-1) ?? unreachable();
		const result = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 64, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToRgba(renderer, first).pipe(
							Effect.flatMap(() => {
								const oldTarget = [...renderer.sync.maskTargets.values()][0]
									?.rt;
								return NodeRenderer.renderToRgba(renderer, second).pipe(
									Effect.map((rgba) => ({
										rgba,
										replaced:
											[...renderer.sync.maskTargets.values()][0]?.rt !==
											oldTarget,
										count: renderer.sync.maskTargets.size,
									})),
								);
							}),
						),
					),
				),
			) as Effect.Effect<
				{ rgba: Uint8Array; replaced: boolean; count: number },
				never
			>,
		);
		expect(result.replaced).toBe(true);
		expect(result.count).toBe(1);
		expect(pixel(result.rgba, -12, 0)[2]).toBeLessThan(30);
		expect(pixel(result.rgba, 12, 0)[2]).toBeGreaterThan(230);
	}, 30_000);

	it("names invalid external frame mask references", async () => {
		const frame = await frameOf(function* () {
			yield* Scene.instantiate("Rect", { width: 20, height: 20 });
			yield* Scene.tick;
		});
		const targetId =
			Object.keys(frame.instances).find((id) => id !== frame.root) ??
			unreachable();
		const forged = {
			...frame,
			masks: { [targetId]: { sourceId: "missing", mode: "alpha" as const } },
		};
		const result = Effect.runSyncExit(
			Sync.syncFrame(Sync.make(builtinRegistry), forged),
		);
		expect(Exit.isFailure(result)).toBe(true);
		if (Exit.isFailure(result)) {
			const error = result.cause.reasons.find(
				(reason) => reason._tag === "Fail",
			);
			expect(error?._tag === "Fail" ? error.error.message : "").toContain(
				targetId,
			);
			expect(error?._tag === "Fail" ? error.error.message : "").toContain(
				"missing",
			);
		}
	});

	it("keeps masked fractional depth temporary during depth of field", async () => {
		const frame = await frameOf(function* () {
			const target = yield* Scene.instantiate("Rect", {
				width: 40,
				height: 30,
				fillColor: Color.rgba(0, 0, 255, 0.5),
			});
			const source = yield* Scene.instantiate("Circle", { radius: 15 });
			yield* Scene.setMask(target, source);
			yield* Scene.tick;
		});
		const focused = {
			...frame,
			camera: {
				...frame.camera,
				aperture: 15,
				focusDistance: 20,
			},
		};
		const result = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 64, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToRgba(renderer, focused).pipe(
							Effect.map((rgba) => ({
								rgba,
								depthRestored: [...renderer.sync.maskDrawables.values()].every(
									(drawable) =>
										!MaskMaterial.fractionalDepthWrite(drawable.variants),
								),
								usedDof: renderer.dofChain !== null,
							})),
						),
					),
				),
			) as Effect.Effect<
				{ rgba: Uint8Array; depthRestored: boolean; usedDof: boolean },
				never
			>,
		);
		expect(result.usedDof).toBe(true);
		expect(result.depthRestored).toBe(true);
		expect(pixel(result.rgba, 0, 0)[2]).toBeGreaterThan(50);
		expect(pixel(result.rgba, 25, 0)[2]).toBeLessThan(
			pixel(result.rgba, 0, 0)[2],
		);
	}, 30_000);
});
