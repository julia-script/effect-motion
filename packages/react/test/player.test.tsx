// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { Effect } from "effect";
import { Motion, Scene, Shapes } from "effect-motion";
import { afterEach, describe, expect, it, vi } from "vitest";

// The real runtime loads a wasm engine over the network, which doesn't
// instantiate under happy-dom. Stub it so the engine reads as "ready" and each
// render is a no-op fiber — these tests cover player *behavior*, not pixels
// (real rendering is proven by the motion framebuffer tests). (design D5)
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

import { Player } from "../src/Player";
import type { AnyScene } from "../src/usePlayer";

afterEach(cleanup);

const tweenScene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Shapes.Circle, { x: 0 });
	// hold the initial state for one frame so frame 0 is x=0
	yield* Scene.tick;
	yield* Motion.tweenTo(circle, { x: 100 }, "500 millis");
}) as AnyScene;

const readyPlayer = async (
	props: { width?: number; height?: number } = { width: 200, height: 100 },
) => {
	const utils = render(<Player scene={tweenScene} {...props} />);
	await waitFor(() => {
		const button = screen.getByRole<HTMLButtonElement>("button", {
			name: "Play",
		});
		expect(button.disabled).toBe(false);
	});
	return utils;
};

describe("Player", () => {
	it("mounts a canvas viewport", async () => {
		const { container } = await readyPlayer();
		expect(container.querySelector("canvas")).not.toBeNull();
	});

	it("becomes ready once the engine and first frame are available", async () => {
		render(<Player scene={tweenScene} width={200} height={100} />);
		// the Play button is disabled while loading, enabled once ready
		await waitFor(() => {
			const button = screen.getByRole<HTMLButtonElement>("button", {
				name: "Play",
			});
			expect(button.disabled).toBe(false);
		});
	});

	it("sizes the viewport from frame metadata with aspect ratio", async () => {
		// no width/height props: the scene's own metadata (runner defaults
		// 500x300) drives the viewport box
		const { container } = await readyPlayer({});
		const viewport = container.querySelector<HTMLElement>(
			"[style*='aspect-ratio']",
		);
		expect(viewport?.style.aspectRatio).toBe("500 / 300");
	});

	it("forwards width/height props into the frame metadata", async () => {
		const { container } = await readyPlayer({ width: 200, height: 100 });
		const viewport = container.querySelector<HTMLElement>(
			"[style*='aspect-ratio']",
		);
		expect(viewport?.style.aspectRatio).toBe("200 / 100");
	});

	it("play/pause button toggles playback", async () => {
		await readyPlayer();
		const button = screen.getByRole("button", { name: "Play" });
		fireEvent.click(button);
		expect(screen.getByRole("button", { name: "Pause" })).toBe(button);
		fireEvent.click(button);
		expect(screen.getByRole("button", { name: "Play" })).toBe(button);
	});

	it("scrubbing the progress bar seeks", async () => {
		await readyPlayer();
		const slider = screen.getByRole("slider", {
			name: "Progress",
		}) as HTMLInputElement;
		await waitFor(() => expect(Number(slider.max)).toBeGreaterThan(1));
		const last = Number(slider.max);
		fireEvent.change(slider, { target: { value: String(last) } });
		expect(slider.value).toBe(String(last));
	});

	it("loop button toggles pressed state", async () => {
		await readyPlayer();
		const loopButton = screen.getByRole("button", { name: "Loop" });
		expect(loopButton.getAttribute("aria-pressed")).toBe("false");
		fireEvent.click(loopButton);
		expect(loopButton.getAttribute("aria-pressed")).toBe("true");
	});

	it("shows a time readout once the scene completes", async () => {
		await readyPlayer();
		// 500ms tween + initial tick at 60fps ≈ 31 frames → 0:00 elapsed of 0:00
		await waitFor(() => {
			expect(screen.getByText(/0:00 \/ 0:00/)).toBeDefined();
		});
	});

	it("space toggles playback from the player root", async () => {
		const { container } = await readyPlayer();
		const root = container.firstElementChild as HTMLElement;
		fireEvent.keyDown(root, { key: " " });
		expect(screen.getByRole("button", { name: "Pause" })).toBeDefined();
		fireEvent.keyDown(root, { key: " " });
		expect(screen.getByRole("button", { name: "Play" })).toBeDefined();
	});

	it("arrow keys step one frame and pause", async () => {
		const { container } = await readyPlayer();
		const root = container.firstElementChild as HTMLElement;
		const slider = screen.getByRole("slider", {
			name: "Progress",
		}) as HTMLInputElement;
		fireEvent.keyDown(root, { key: "ArrowRight" });
		expect(slider.value).toBe("1");
		fireEvent.keyDown(root, { key: "ArrowLeft" });
		expect(slider.value).toBe("0");
	});
});
