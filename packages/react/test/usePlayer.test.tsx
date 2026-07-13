// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Effect } from "effect";
import { Motion, Scene, Shapes } from "effect-motion";
import { afterEach, describe, expect, it } from "vitest";
import { type AnyScene, usePlayer } from "../src/usePlayer";

afterEach(cleanup);

const tweenScene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
	yield* Motion.tweenTo(circle, { x: 100 }, "500 millis");
}) as AnyScene;

const failingScene = Scene.make(function* () {
	yield* Effect.fail("boom");
}) as AnyScene;

const ready = async (result: { current: { status: string } }) => {
	await waitFor(() => expect(result.current.status).toBe("ready"));
};

describe("usePlayer", () => {
	it("collects frames on mount and becomes ready", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		expect(result.current.status).toBe("loading");
		await ready(result);
		expect(result.current.totalFrames).toBeGreaterThan(1);
		expect(result.current.frame).toBe(0);
		expect(result.current.playing).toBe(false);
		expect(result.current.currentFrame).not.toBeNull();
	});

	it("surfaces a failing scene as error state", async () => {
		const { result } = renderHook(() => usePlayer(failingScene));
		await waitFor(() => expect(result.current.status).toBe("error"));
		expect(String(result.current.error)).toContain("boom");
	});

	it("interrupts collection on unmount without state updates", async () => {
		const { result, unmount } = renderHook(() => usePlayer(tweenScene));
		unmount();
		// give the aborted collection time to settle; a post-unmount setState
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

	it("seek clamps to both ends", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await ready(result);
		const last = result.current.totalFrames - 1;
		act(() => result.current.seek(9999));
		expect(result.current.frame).toBe(last);
		act(() => result.current.seek(-5));
		expect(result.current.frame).toBe(0);
		act(() => result.current.seek(2));
		expect(result.current.frame).toBe(2);
	});

	it("auto-pauses at the last frame with progress 1", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await ready(result);
		act(() => result.current.seek(result.current.totalFrames - 2));
		act(() => result.current.play());
		await waitFor(() => expect(result.current.playing).toBe(false));
		expect(result.current.frame).toBe(result.current.totalFrames - 1);
		expect(result.current.progress).toBe(1);
	});

	it("play after completion restarts from frame 0", async () => {
		const { result } = renderHook(() => usePlayer(tweenScene));
		await ready(result);
		act(() => result.current.seek(result.current.totalFrames - 1));
		act(() => result.current.play());
		expect(result.current.playing).toBe(true);
		expect(result.current.frame).toBe(0);
	});

	it("autoPlay starts playback once ready", async () => {
		const { result } = renderHook(() =>
			usePlayer(tweenScene, { autoPlay: true }),
		);
		await ready(result);
		expect(result.current.playing).toBe(true);
	});
});
