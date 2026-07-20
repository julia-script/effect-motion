import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import type * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";

const oneFrameScene = (meta?: Partial<Runner.CompConfig>) =>
	Scene.make(function* () {
		yield* Scene.instantiate(Shapes.Circle, { x: 5, y: 6 });
		yield* Scene.tick;
	}, meta);

const firstFrame = (
	meta?: Partial<Runner.CompConfig>,
	settings: Partial<Runner.Settings> = {},
) =>
	Effect.runPromise(
		Scene.stream(oneFrameScene(meta), settings).pipe(Stream.runHead),
	).then((head) => {
		if (head._tag !== "Some") throw new Error("scene produced no frames");
		return head.value;
	});

describe("frame render metadata", () => {
	it("frames carry frameRate from settings, resolution/background from the root scene", async () => {
		const frame = await firstFrame(
			{ width: 800, height: 600, backgroundColor: Color.hex("#222244") },
			{ frameRate: 30 },
		);
		expect(frame.frameRate).toBe(30);
		expect(frame.width).toBe(800);
		expect(frame.height).toBe(600);
		expect(Color.toHex(frame.backgroundColor)).toBe("#222244");
	});

	it("defaults apply when the scene has no comp config", async () => {
		const frame = await firstFrame();
		expect(frame.frameRate).toBe(60);
		expect(frame.width).toBe(1920);
		expect(frame.height).toBe(1080);
		expect(Color.bytes(frame.backgroundColor).a).toBe(0);
	});
});
