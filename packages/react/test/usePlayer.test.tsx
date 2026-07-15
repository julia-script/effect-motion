// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Effect } from "effect";
import { Motion, Scene, Shapes } from "effect-motion";
import { afterEach, describe, expect, it, vi } from "vitest";

// stub the wasm engine runtime (no wasm under happy-dom): the engine reads as
// ready immediately and renders are no-op fibers, so these hook tests exercise
// frame production / buffering / status logic, not real rendering (design D5)
vi.mock("../src/runtime", () => {
	const fiber = Effect.runFork(Effect.void);
	return {
		DEFAULT_WASM_BASE: "mock://wasm/",
		getRuntime: () => ({
			runPromise: () => Promise.resolve(undefined),
			runFork: () => fiber,
			dispose: () => Promise.resolve(),
		}),
	};
});

import { type AnyScene, usePlayer } from "../src/usePlayer";

afterEach(cleanup);

const tweenScene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
	yield* Motion.tweenTo(circle, { x: 100 }, "500 millis");
}) as AnyScene;

const infiniteScene = Scene.make(function* () {
	yield* Scene.instantiate(Shapes.Circle, { x: 0 });
	while (true) {
		yield* Scene.tick;
	}
}) as AnyScene;

const failingScene = Scene.make(function* () {
	yield* Effect.fail("boom");
}) as AnyScene;

const ready = async (result: { current: { status: string } }) => {
	await waitFor(() => expect(result.current.status).toBe("ready"));
};

const complete = async (result: {
	current: { totalFrames: number | null };
}) => {
	await waitFor(() => expect(result.current.totalFrames).not.toBeNull());
};

describe("usePlayer", () => {
	it("becomes ready and resolves totalFrames when the stream completes", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		expect(result.current.status).toBe("loading");
		expect(result.current.totalFrames).toBeNull();
		await ready(result);
		expect(result.current.bufferedFrames).toBeGreaterThan(0);
		expect(result.current.currentFrame).not.toBeNull();
		await complete(result);
		expect(result.current.totalFrames).toBeGreaterThan(1);
		expect(result.current.frame).toBe(0);
		expect(result.current.playing).toBe(false);
	});

	it("plays an infinite scene without termination", async () => {
		const { result, unmount } = renderHook(() => usePlayer(infiniteScene));
		await ready(result);
		act(() => result.current.play());
		await waitFor(() => expect(result.current.frame).toBeGreaterThan(0));
		expect(result.current.totalFrames).toBeNull();
		expect(result.current.playing).toBe(true);
		unmount();
	});

	it("forwards width/height to the runner so frames carry them", async () => {
		const { result } = renderHook(() =>
			usePlayer(tweenScene, { width: 800, height: 600 }),
		);
		await ready(result);
		expect(result.current.currentFrame?.width).toBe(800);
		expect(result.current.currentFrame?.height).toBe(600);
	});

	it("surfaces a failing scene as error state", async () => {
		const { result } = renderHook(() => usePlayer(failingScene));
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(String(result.current.error)).toContain("boom");
	});

	it("interrupts frame acquisition on unmount without state updates", async () => {
		const { result, unmount } = renderHook(() => usePlayer(infiniteScene));
		unmount();
		// give the aborted pull time to settle; a post-unmount setState
		// would make React log an error and fail the run
		await new Promise((resolve) => setTimeout(resolve, 50));
		expect(result.current.status).toBe("loading");
	});

	it("play advances frames over time and progress grows", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await ready(result);
		act(() => result.current.play());
		expect(result.current.playing).toBe(true);
		await waitFor(() => expect(result.current.frame).toBeGreaterThan(0));
		expect(result.current.progress).toBeGreaterThan(0);
	});

	it("pause freezes the current frame", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await ready(result);
		act(() => result.current.play());
		await waitFor(() => expect(result.current.frame).toBeGreaterThan(0));
		act(() => result.current.pause());
		const frozen = result.current.frame;
		await new Promise((resolve) => setTimeout(resolve, 60));
		expect(result.current.frame).toBe(frozen);
		expect(result.current.playing).toBe(false);
	});

	it("seek clamps to the buffered range", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await complete(result);
		const last = result.current.bufferedFrames - 1;
		act(() => result.current.seek(9999));
		expect(result.current.frame).toBe(last);
		act(() => result.current.seek(-5));
		expect(result.current.frame).toBe(0);
		act(() => result.current.seek(2));
		expect(result.current.frame).toBe(2);
	});

	it("auto-pauses at the last frame with progress 1", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await complete(result);
		const total = result.current.totalFrames as number;
		act(() => result.current.seek(total - 2));
		act(() => result.current.play());
		await waitFor(() => expect(result.current.playing).toBe(false));
		expect(result.current.frame).toBe(total - 1);
		expect(result.current.progress).toBe(1);
	});

	it("loop wraps playback to frame 0 instead of pausing", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await complete(result);
		const total = result.current.totalFrames as number;
		act(() => result.current.setLoop(true));
		act(() => result.current.seek(total - 2));
		act(() => result.current.play());
		await waitFor(() => expect(result.current.frame).toBeLessThan(total - 2));
		expect(result.current.playing).toBe(true);
	});

	it("play after completion restarts from frame 0", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await complete(result);
		act(() => result.current.seek((result.current.totalFrames as number) - 1));
		act(() => result.current.play());
		expect(result.current.playing).toBe(true);
		expect(result.current.frame).toBe(0);
	});

	it("autoPlay starts playback once the first frame is buffered", async () => {
		const { result } = renderHook(() =>
			usePlayer(tweenScene, { autoPlay: true }),
		);
		await ready(result);
		expect(result.current.playing).toBe(true);
	});
});
