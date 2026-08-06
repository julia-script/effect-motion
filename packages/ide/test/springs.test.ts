import { Effect } from "effect";
import * as Stream from "effect/Stream";
import * as S from "effect-motion/Entity";
import * as Physics from "effect-motion/Physics";
import * as Scene from "effect-motion/Scene";
import { describe, expect, it } from "vitest";
import * as Springs from "../src/Springs";

describe("catalog", () => {
	it("mirrors Physics.springs exactly", () => {
		expect(Springs.springs).toEqual(Physics.springs);
	});

	it("documents every preset, in the same order", () => {
		expect(Springs.presets.map((preset) => preset.name)).toEqual(
			Object.keys(Physics.springs),
		);
	});

	it("recognises names and rejects everything else", () => {
		expect(Springs.isSpringName("swing")).toBe(true);
		expect(Springs.isSpringName("sproing")).toBe(false);
	});
});

const frameCount = async (
	body: () => Generator<never, void, never>,
	frameRate: number,
): Promise<number> => {
	const scene = Scene.make(body as never, {});
	const frames = await Effect.runPromise(
		Stream.runCollect(
			Scene.stream(scene as never, { frameRate }),
		) as unknown as Effect.Effect<Iterable<unknown>>,
	);
	return [...frames].length;
};

/**
 * Frames the spring itself occupies, with the scene's own opening frame
 * subtracted — a scene that animates nothing still emits one frame, and
 * that frame belongs to the scene, not to the animator.
 */
const engineFrames = async (
	spring: Physics.SpringName,
	frameRate: number,
	distance: number,
): Promise<number> => {
	const instantiate = function* () {
		yield* Scene.instantiate("Circle", { position: S.vec3({ x: 0 }) });
	};
	const baseline = await frameCount(instantiate as never, frameRate);
	const animated = await frameCount(
		function* () {
			const circle = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 0 }),
			});
			yield* Physics.springTo(circle, { x: distance }, spring);
		} as never,
		frameRate,
	);
	return animated - baseline;
};

describe("simulation", () => {
	it.each(
		Springs.presets.map((preset) => preset.name),
	)("reports the frame count the engine produces (%s)", async (name) => {
		const engine = await engineFrames(name, 60, 100);
		const preview = Springs.simulate(Springs.springs[name], {
			frameRate: 60,
			distance: 100,
		});
		expect(preview.truncated).toBe(false);
		expect(preview.frames).toBe(engine);
	});

	it("agrees at a different frame rate", async () => {
		const engine = await engineFrames("smooth", 24, 100);
		expect(
			Springs.simulate(Springs.springs.smooth, {
				frameRate: 24,
				distance: 100,
			}).frames,
		).toBe(engine);
	});

	it("agrees over a different distance", async () => {
		const engine = await engineFrames("plop", 60, 400);
		expect(
			Springs.simulate(Springs.springs.plop, {
				frameRate: 60,
				distance: 400,
			}).frames,
		).toBe(engine);
	});

	it("normalises the final sample onto the target", () => {
		for (const preset of Springs.presets)
			expect(Springs.simulate(preset.spring).samples.at(-1), preset.name).toBe(
				1,
			);
	});

	it("reports seconds as frames over the frame rate", () => {
		const run = Springs.simulate(Springs.springs.smooth, { frameRate: 30 });
		expect(run.seconds).toBeCloseTo(run.frames / 30, 10);
	});

	it("gives up on a spring that never settles instead of hanging", () => {
		const run = Springs.simulate(
			{ mass: 1, stiffness: 10, damping: 0 },
			{ maxFrames: 120 },
		);
		expect(run.truncated).toBe(true);
		expect(run.frames).toBe(121);
	});

	it("survives a zero-distance move", () => {
		const run = Springs.simulate(Springs.springs.jump, { distance: 0 });
		expect(run.samples.every((value) => Number.isFinite(value))).toBe(true);
	});
});
