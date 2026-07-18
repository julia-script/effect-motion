import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import { render } from "./support/framebuffer";

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
			backgroundColor: Color.hex("#222244"),
		});
		expect(frame.frameRate).toBe(30);
		expect(frame.width).toBe(800);
		expect(frame.height).toBe(600);
		expect(Color.toHex(frame.backgroundColor)).toBe("#222244");
	});

	it("defaults apply when settings are unset", async () => {
		const frame = await firstFrame();
		expect(frame.frameRate).toBe(60);
		expect(frame.width).toBe(500);
		expect(frame.height).toBe(300);
		expect(Color.toHex(frame.backgroundColor)).toBe("#16161d");
	});
});

describe("renderer sizes and backgrounds the framebuffer from frame metadata", () => {
	it("the framebuffer takes the frame's resolution", async () => {
		const frame = await firstFrame({ width: 320, height: 200 });
		const r = await render(
			frame as Scene.Frame<typeof Shapes.Circle | typeof Shapes.Group>,
		);
		expect(r.width).toBe(320);
		expect(r.height).toBe(200);
	});

	it("the frame's background color fills the buffer", async () => {
		// a corner far from the single small circle shows the background color
		const frame = await firstFrame({
			width: 320,
			height: 200,
			backgroundColor: Color.hex("#224466"),
		});
		const r = await render(
			frame as Scene.Frame<typeof Shapes.Circle | typeof Shapes.Group>,
		);
		expect(r.at(310, 190)).toEqual([0x22, 0x44, 0x66, 255]);
	});
});
