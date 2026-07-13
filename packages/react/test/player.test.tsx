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

const readyPlayer = async () => {
	const utils = render(<Player scene={tweenScene} width={200} height={100} />);
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
		const last = Number(slider.max);
		expect(last).toBeGreaterThan(1);
		fireEvent.change(slider, { target: { value: String(last) } });
		expect(slider.value).toBe(String(last));
		await waitFor(() => {
			const circle = container.querySelector("svg circle");
			expect(circle?.getAttribute("cx")).toBe("100");
		});
	});
});
