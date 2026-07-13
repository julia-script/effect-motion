import { Effect } from "effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

const oneFrameScene = Scene.make(function* () {
	yield* Scene.instantiate(Shapes.Circle, { x: 5, y: 6 });
	yield* Scene.tick;
});

const firstFrame = (settings: Partial<Runner.Settings> = {}) =>
	Effect.runPromise(
		Scene.stream(oneFrameScene, settings).pipe(Stream.runHead),
	).then((head) => {
		if (head._tag !== "Some") throw new Error("scene produced no frames");
		return head.value;
	});

describe("frame render metadata", () => {
	it("frames carry explicit frameRate/width/height from settings", async () => {
		const frame = await firstFrame({
			frameRate: 30,
			width: 800,
			height: 600,
			backgroundColor: "#222244",
		});
		expect(frame.frameRate).toBe(30);
		expect(frame.width).toBe(800);
		expect(frame.height).toBe(600);
		expect(frame.backgroundColor).toBe("#222244");
	});

	it("defaults apply when settings are unset", async () => {
		const frame = await firstFrame();
		expect(frame.frameRate).toBe(60);
		expect(frame.width).toBe(500);
		expect(frame.height).toBe(300);
		expect(frame.backgroundColor).toBe("#16161d");
	});
});

describe("SVG string sink sizing from frame metadata", () => {
	const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));
	const renderString = (
		frame: Scene.Frame<typeof Shapes.Circle | typeof Shapes.Group>,
		config: Svg.SvgConfig,
	) =>
		Effect.runPromise(
			Effect.gen(function* () {
				const renderer = yield* Svg.SvgRenderer.Context;
				return yield* renderer.render(frame, config);
			}).pipe(Effect.provide(layers)),
		);

	it("no size in config falls back to the frame's resolution", async () => {
		const frame = await firstFrame({ width: 800, height: 600 });
		const svg = await renderString(frame, {});
		expect(svg).toContain('width="800"');
		expect(svg).toContain('height="600"');
		expect(svg).toContain('<rect width="100%" height="100%" fill="#16161d"/>');
	});

	it("explicit config overrides frame metadata", async () => {
		const frame = await firstFrame({ width: 800, height: 600 });
		const svg = await renderString(frame, { width: 100, height: 100 });
		expect(svg).toContain('width="100"');
		expect(svg).toContain('height="100"');
	});
});
