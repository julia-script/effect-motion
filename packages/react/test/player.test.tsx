// @vitest-environment happy-dom
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { Motion, Scene, Shapes } from "effect-motion";
import { afterEach, describe, expect, it } from "vitest";
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
	it("renders the first frame's SVG into the viewport", async () => {
		const { container } = await readyPlayer();
		const circle = container.querySelector("svg circle");
		expect(circle).not.toBeNull();
		expect(circle?.getAttribute("cx")).toBe("0");
	});

	it("sizes the viewport from frame metadata with aspect ratio", async () => {
		// no width/height props: the scene's own metadata (runner defaults
		// 500x300) drives the viewport
		const { container } = await readyPlayer({});
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("viewBox")).toBe("0 0 500 300");
		const viewport = container.querySelector<HTMLElement>(
			"[style*='aspect-ratio']",
		);
		expect(viewport?.style.aspectRatio).toBe("500 / 300");
	});

	it("forwards width/height props into the frame metadata", async () => {
		const { container } = await readyPlayer({ width: 200, height: 100 });
		const svg = container.querySelector("svg");
		expect(svg?.getAttribute("viewBox")).toBe("0 0 200 100");
	});

	it("play/pause button toggles playback", async () => {
		await readyPlayer();
		const button = screen.getByRole("button", { name: "Play" });
		fireEvent.click(button);
		expect(screen.getByRole("button", { name: "Pause" })).toBe(button);
		fireEvent.click(button);
		expect(screen.getByRole("button", { name: "Play" })).toBe(button);
	});

	it("scrubbing the progress bar seeks the viewport", async () => {
		const { container } = await readyPlayer();
		const slider = screen.getByRole("slider", {
			name: "Progress",
		}) as HTMLInputElement;
		await waitFor(() => expect(Number(slider.max)).toBeGreaterThan(1));
		const last = Number(slider.max);
		fireEvent.change(slider, { target: { value: String(last) } });
		expect(slider.value).toBe(String(last));
		await waitFor(() => {
			const circle = container.querySelector("svg circle");
			expect(circle?.getAttribute("cx")).toBe("100");
		});
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
