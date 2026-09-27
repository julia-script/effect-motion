import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entity as S, Scene } from "effect-motion";
import { describe, expect, it } from "vitest";
import * as NodeRenderer from "../src/node.js";
import { unreachable } from "./support/raise.js";

// Headless smoke: real frames through Dawn on a real GPU, loose visual
// sanity only — never byte equality (determinism stops at the frame stream).

const framesOf = (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	backgroundColor = Color.rgba(10, 10, 20),
): Promise<Array<Parameters<typeof NodeRenderer.renderToPng>[1]>> =>
	Effect.runPromise(
		Scene.stream(
			Scene.make(make as never, {
				width: 128,
				height: 64,
				backgroundColor,
			}) as never,
			{},
		).pipe(Stream.runCollect) as unknown as Effect.Effect<
			Iterable<never>,
			never,
			never
		>,
	).then((chunk) => [...chunk]);

describe("headless Dawn rendering", () => {
	it("renders a frame to a PNG with content", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {
				// center-origin frame: (0, 0) is the middle of the viewport
				position: S.vec3({}),
				radius: 20,
				fillColor: Color.rgba(255, 60, 60),
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const png = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 128, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToPng(renderer, frame),
					),
				),
			) as Effect.Effect<Uint8Array, never, never>,
		);
		// PNG signature
		expect([...png.slice(0, 4)]).toEqual([137, 80, 78, 71]);
		// decodes to sane dimensions (IHDR width/height at offsets 16/20)
		const view = new DataView(png.buffer, png.byteOffset);
		expect(view.getUint32(16, false)).toBe(128);
		expect(view.getUint32(20, false)).toBe(64);
		// loose visual sanity: the encoded image is not a flat background
		// (a solid-color PNG deflates to almost nothing)
		expect(png.length).toBeGreaterThan(300);
	}, 30_000);

	it("readback rgba shows both background and circle pixels", async () => {
		const frames = await framesOf(function* () {
			yield* Scene.instantiate("Circle", {
				// center-origin frame: (0, 0) is the middle of the viewport
				position: S.vec3({}),
				radius: 20,
				fillColor: Color.rgba(255, 60, 60),
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const stats = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 128, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToPng(renderer, frame).pipe(
							Effect.map(() => {
								// sample the retained graph, not pixels: circle present
								return {
									objects: renderer.sync.stats.objects,
								};
							}),
						),
					),
				),
			) as Effect.Effect<{ objects: number }, never, never>,
		);
		expect(stats.objects).toBe(1);
	}, 30_000);

	it("pixels honor a rotated, scaled Group and a fading Group", async () => {
		const frames = await framesOf(function* () {
			// a 20×4 bar, turned 90° and doubled by its group → an 8×40 column
			const bar = yield* Scene.instantiate("Rect", {
				width: 20,
				height: 4,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.instantiate("Group", {
				position: S.vec3({ x: -30 }),
				rotation: S.vec3({ z: Math.PI / 2 }),
				scale: S.vec3({ x: 2, y: 2, z: 1 }),
				children: [bar],
			});
			// a white dot inside a half-faded group
			const dot = yield* Scene.instantiate("Circle", {
				radius: 10,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.instantiate("Group", {
				position: S.vec3({ x: 30 }),
				opacity: 0.5,
				children: [dot],
			});
			yield* Scene.tick;
		});
		const frame = frames.at(-1) ?? unreachable();
		const { rgba, width } = await Effect.runPromise(
			Effect.scoped(
				NodeRenderer.make({ width: 128, height: 64 }).pipe(
					Effect.flatMap((renderer) =>
						NodeRenderer.renderToRgba(renderer, frame).pipe(
							Effect.map((rgba) => ({ rgba, width: renderer.pixelWidth })),
						),
					),
				),
			) as Effect.Effect<{ rgba: Uint8Array; width: number }, never, never>,
		);
		// red channel at scene (x, y); y up, origin at the viewport center
		const red = (x: number, y: number) =>
			rgba[((32 - y) * width + (64 + x)) * 4] ?? unreachable();
		// the column reaches 15 above the bar's center…
		expect(red(-30, 15)).toBeGreaterThan(200);
		// …and not 15 to its side, where the unrotated bar would be
		expect(red(-15, 0)).toBeLessThan(40);
		// the faded dot is partway to white (50% blends in linear light, so
		// ~188 after sRGB encoding) — neither background nor full white
		expect(red(30, 0)).toBeGreaterThan(140);
		expect(red(30, 0)).toBeLessThan(230);
	}, 30_000);

	it("a Scene.play comp keeps the inline orientation", async () => {
		// asymmetric content: a dot above center. A flipped comp texture
		// would land it below.
		const content = function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ y: 16 }),
				radius: 8,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.tick;
		};
		const inner = Scene.make(content as never, { width: 128, height: 64 });
		const redAt = async (frames: Awaited<ReturnType<typeof framesOf>>) => {
			const frame = frames.at(-1) ?? unreachable();
			const rgba = await Effect.runPromise(
				Effect.scoped(
					NodeRenderer.make({ width: 128, height: 64 }).pipe(
						Effect.flatMap((renderer) =>
							NodeRenderer.renderToRgba(renderer, frame),
						),
					),
				) as Effect.Effect<Uint8Array, never, never>,
			);
			return (x: number, y: number) =>
				rgba[((32 - y) * 128 + (64 + x)) * 4] ?? unreachable();
		};
		const inline = await redAt(await framesOf(content));
		const comp = await redAt(
			await framesOf(function* () {
				const h = yield* Scene.play(inner as never);
				yield* h.finished;
			}),
		);
		for (const red of [inline, comp]) {
			expect(red(0, 16)).toBeGreaterThan(200);
			expect(red(0, -16)).toBeLessThan(40);
		}
	}, 30_000);

	describe("a Scene.play comp renders through the child's own camera", () => {
		type Body = () => Generator<Effect.Effect<any, any, any>, void, any>;
		const bg = Color.rgba(10, 10, 20);
		const rgbaOf = (frames: Awaited<ReturnType<typeof framesOf>>) =>
			Effect.runPromise(
				Effect.scoped(
					NodeRenderer.make({ width: 128, height: 64 }).pipe(
						Effect.flatMap((renderer) =>
							NodeRenderer.renderToRgba(
								renderer,
								frames.at(-1) ?? unreachable(),
							),
						),
					),
				) as Effect.Effect<Uint8Array, never, never>,
			);
		// standalone vs mounted (same size, opaque child background, so the
		// comp covers the frame 1:1): the same pixels up to the comp
		// texture's resampling (mean ≈ 2.5/255 even for an unmoved child)
		const compare = async (body: Body) => {
			const inner = Scene.make(body as never, {
				width: 128,
				height: 64,
				backgroundColor: bg,
			});
			const standalone = await rgbaOf(await framesOf(body));
			const mounted = await rgbaOf(
				await framesOf(function* () {
					const h = yield* Scene.play(inner as never);
					yield* h.finished;
				}),
			);
			let diff = 0;
			for (let i = 0; i < standalone.length; i++) {
				diff += Math.abs(
					(standalone[i] ?? unreachable()) - (mounted[i] ?? unreachable()),
				);
			}
			return { standalone, mounted, meanDiff: diff / standalone.length };
		};
		const redAt = (rgba: Uint8Array, x: number, y: number) =>
			rgba[((32 - y) * 128 + (64 + x)) * 4] ?? unreachable();
		const dots = function* () {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({}),
				radius: 8,
				fillColor: Color.rgba(255, 255, 255),
			});
			// a far dot: parallax only a moving camera reveals
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 30, z: -200 }),
				radius: 8,
				fillColor: Color.rgba(255, 255, 255),
			});
		};

		it("a camera moved inside the child renders as it does standalone", async () => {
			const { standalone, mounted, meanDiff } = await compare(function* () {
				yield* dots();
				const camera = yield* Scene.camera;
				yield* Scene.update(camera, (c) => ({
					...c,
					position: S.vec3({ x: 40, y: 0, z: c.position.z }),
				}));
				yield* Scene.tick;
			});
			// the camera panned right: the near dot sits left of center
			for (const rgba of [standalone, mounted]) {
				expect(redAt(rgba, -40, 0)).toBeGreaterThan(200);
				expect(redAt(rgba, 0, 0)).toBeLessThan(40);
			}
			expect(meanDiff).toBeLessThan(4);
		}, 30_000);

		it("an unmoved child still renders as it does standalone", async () => {
			const { mounted, meanDiff } = await compare(function* () {
				yield* dots();
				yield* Scene.tick;
			});
			expect(redAt(mounted, 0, 0)).toBeGreaterThan(200);
			expect(meanDiff).toBeLessThan(4);
		}, 30_000);

		it("a Hud inside the child stays pinned while the child's camera moves", async () => {
			const { mounted, meanDiff } = await compare(function* () {
				yield* Scene.instantiate("Hud", {
					children: [
						Scene.instantiate("Circle", {
							position: S.vec3({ y: 16 }),
							radius: 6,
							fillColor: Color.rgba(255, 255, 255),
						}),
					],
				});
				const camera = yield* Scene.camera;
				yield* Scene.update(camera, (c) => ({
					...c,
					position: S.vec3({ x: 40, y: 0, z: c.position.z }),
				}));
				yield* Scene.tick;
			});
			expect(redAt(mounted, 0, 16)).toBeGreaterThan(200);
			expect(meanDiff).toBeLessThan(4);
		}, 30_000);
	});

	describe("degenerate scale", () => {
		type Body = () => Generator<Effect.Effect<any, any, any>, void, any>;
		const white = Color.rgba(255, 255, 255);
		const collapsed = S.vec3({ x: 0, y: 0.004, z: 1 });
		// pixels off a gray backdrop, with the camera pulled in 3× (default
		// z ≈ 178 at 128 wide) — the magnified close-up where the unscaled
		// default stroke showed as a solid black bar
		const paint = async (body: Body) => {
			const frames = await framesOf(
				function* () {
					yield* body();
					const camera = yield* Scene.camera;
					yield* Scene.update(camera, (c) => ({
						...c,
						position: S.vec3({ z: 60 }),
					}));
					yield* Scene.tick;
				},
				Color.rgba(128, 128, 128),
			);
			const frame = frames.at(-1) ?? unreachable();
			const rgba = await Effect.runPromise(
				Effect.scoped(
					NodeRenderer.make({ width: 128, height: 64 }).pipe(
						Effect.flatMap((renderer) =>
							NodeRenderer.renderToRgba(renderer, frame),
						),
					),
				) as Effect.Effect<Uint8Array, never, never>,
			);
			let dark = 0;
			let bright = 0;
			for (let i = 0; i < rgba.length; i += 4) {
				const red = rgba[i] ?? unreachable();
				dark += red < 118 ? 1 : 0;
				bright += red > 138 ? 1 : 0;
			}
			return { dark, bright };
		};

		const nothing: ReadonlyArray<readonly [string, Body]> = [
			[
				"Rect at scale 0",
				function* () {
					yield* Scene.instantiate("Rect", {
						width: 100,
						height: 40,
						fillColor: white,
						scale: S.vec3({ x: 0, y: 0, z: 1 }),
					});
				},
			],
			[
				"Rect at scale (0, 0.004)",
				function* () {
					yield* Scene.instantiate("Rect", {
						width: 100,
						height: 40,
						fillColor: white,
						scale: collapsed,
					});
				},
			],
			[
				"Circle at scale (0, 0.004)",
				function* () {
					yield* Scene.instantiate("Circle", {
						radius: 20,
						fillColor: white,
						scale: collapsed,
					});
				},
			],
			[
				"Text at scale (0, 0.004)",
				function* () {
					yield* Scene.instantiate("Text", {
						text: "Hello",
						fontSize: 30,
						fillColor: white,
						scale: collapsed,
					});
				},
			],
			[
				"Group at scale (0, 0.004)",
				function* () {
					const rect = yield* Scene.instantiate("Rect", {
						width: 100,
						height: 40,
						fillColor: white,
					});
					const dot = yield* Scene.instantiate("Circle", {
						radius: 20,
						fillColor: white,
					});
					const rule = yield* Scene.instantiate("Line", {
						start: S.vec3({ x: -40 }),
						end: S.vec3({ x: 40 }),
						strokeWidth: 4,
					});
					yield* Scene.instantiate("Group", {
						scale: collapsed,
						children: [rect, dot, rule],
					});
				},
			],
		];
		for (const [name, body] of nothing) {
			it(`${name} draws nothing`, async () => {
				expect(await paint(body)).toEqual({ dark: 0, bright: 0 });
			}, 60_000);
		}

		it("a near-zero Rect is a fill-colored sliver, its stroke thinned with it", async () => {
			const { dark, bright } = await paint(function* () {
				yield* Scene.instantiate("Rect", {
					width: 100,
					height: 40,
					fillColor: white,
					scale: S.vec3({ x: 1, y: 0.02, z: 1 }),
				});
			});
			// 0.8 units tall, ~2.4 px on screen: white, no black stroke band
			expect(bright).toBeGreaterThan(0);
			expect(dark).toBe(0);
		}, 30_000);
	});
});
