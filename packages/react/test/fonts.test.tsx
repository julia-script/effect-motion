// @vitest-environment happy-dom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { Effect } from "effect";
import { Fonts, Scene, Shapes } from "effect-motion";
import { afterEach, describe, expect, it, vi } from "vitest";

// Fonts now load INTO the ThorVG engine during acquire (design D5) — not as
// browser FontFaces. The runtime mock stands in for the engine: its runPromise
// settling means "engine acquired (fonts loaded)". `capturedFonts` records the
// family→url map the player passed to getRuntime, and `engineGate` lets a test
// hold acquisition open to observe the loading→ready transition.
let capturedFonts: Record<string, string> | undefined;
let engineGate: Promise<undefined> = Promise.resolve(undefined);

vi.mock("../src/runtime", () => {
	const fiber = Effect.runFork(Effect.void);
	return {
		DEFAULT_WASM_BASE: "mock://wasm/",
		getRuntime: (_url?: string, fonts?: Record<string, string>) => {
			capturedFonts = fonts;
			return {
				runPromise: () => engineGate,
				runFork: () => fiber,
				dispose: () => Promise.resolve(),
			};
		},
	};
});

import { type AnyScene, usePlayer } from "../src/usePlayer";

afterEach(() => {
	cleanup();
	capturedFonts = undefined;
	engineGate = Promise.resolve(undefined);
});

const textScene = () =>
	Scene.make(function* () {
		yield* Scene.instantiate(Shapes.Text, { text: "hi", x: 10, y: 10 });
		yield* Scene.tick;
	}) as AnyScene;

describe("usePlayer font loading", () => {
	it("passes the scene's declared url fonts to the engine", async () => {
		const scene = textScene().annotate(Fonts.Fonts, [
			{ family: "Inter", src: { url: "/fonts/inter.ttf" }, weight: 700 },
		]) as AnyScene;
		renderHook(() => usePlayer(scene));
		await waitFor(() => expect(capturedFonts).toBeDefined());
		expect(capturedFonts).toEqual({ Inter: "/fonts/inter.ttf" });
	});

	it("holds ready until the engine (with its fonts) has acquired", async () => {
		// hold the engine acquire open, then release it
		let release!: () => void;
		engineGate = new Promise<undefined>((r) => {
			release = () => r(undefined);
		});
		const scene = textScene().annotate(Fonts.Fonts, [
			{ family: "Inter", src: { url: "/fonts/inter.ttf" } },
		]) as AnyScene;
		const { result } = renderHook(() => usePlayer(scene));

		await waitFor(() =>
			expect(result.current.bufferedFrames).toBeGreaterThan(0),
		);
		// frames buffered but the engine hasn't acquired → still loading
		expect(result.current.status).toBe("loading");

		release();
		await waitFor(() => expect(result.current.status).toBe("ready"));
	});

	it("a font that fails inside the engine still reaches ready", async () => {
		// a failed FONT load is swallowed inside engine acquire (a warning, not a
		// rejection), so the engine still resolves and the player reaches ready.
		const scene = textScene().annotate(Fonts.Fonts, [
			{ family: "Ghost", src: { url: "/fonts/missing.ttf" } },
		]) as AnyScene;
		const { result } = renderHook(() => usePlayer(scene));
		await waitFor(() => expect(result.current.status).toBe("ready"));
	});

	it("path-only entries are not passed to the engine", async () => {
		const scene = textScene().annotate(Fonts.Fonts, [
			{ family: "Inter", src: { path: "./fonts/Inter.ttf" } },
		]) as AnyScene;
		renderHook(() => usePlayer(scene));
		await waitFor(() => expect(capturedFonts).toBeDefined());
		// fetch-by-url only: a path-only entry produces no engine font
		expect(capturedFonts).toEqual({});
	});

	it("Fonts.urlMap keeps url entries and drops path-only", () => {
		const scene = textScene().annotate(Fonts.Fonts, [
			{ family: "A", src: { url: "/a.ttf" } },
			{ family: "B", src: { path: "/b.ttf" } },
		]) as AnyScene;
		expect(Fonts.urlMap(scene)).toEqual({ A: "/a.ttf" });
	});
});
