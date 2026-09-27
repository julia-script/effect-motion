import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entity as S, Scene } from "effect-motion";
import { expect, it } from "vitest";
import { Stills } from "../src";

// real Dawn GPU, like the renderer's headless-node tests; dimensions only
const scene = Scene.make(
	function* () {
		yield* Scene.instantiate("Circle", {
			position: S.vec3({}),
			radius: 20,
			fillColor: Color.rgba(255, 60, 60),
		});
		for (let i = 0; i < 3; i++) yield* Scene.tick;
	},
	{ width: 64, height: 32, backgroundColor: Color.rgba(10, 10, 20) },
);

const ihdr = (png: Uint8Array) => {
	const view = new DataView(png.buffer, png.byteOffset);
	return [view.getUint32(16, false), view.getUint32(20, false)];
};

it("renders a still and a 4-tile contact sheet", async () => {
	const frames = [
		...(await Effect.runPromise(Stream.runCollect(Scene.stream(scene)))),
	];
	expect(frames).toHaveLength(4);
	const [stills, sheet] = await Effect.runPromise(
		Effect.all([
			Stills.render(frames.slice(0, 1)),
			Stills.contactSheet(frames, { gap: 2 }),
		]),
	);
	expect(stills).toHaveLength(1);
	expect(ihdr(stills[0] ?? new Uint8Array())).toEqual([64, 32]);
	expect(sheet.columns).toBe(2);
	expect(ihdr(sheet.png)).toEqual([64 * 2 + 2, 32 * 2 + 2]);
}, 30_000);
