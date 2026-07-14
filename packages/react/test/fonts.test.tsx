// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { Fonts, Scene, Shapes } from "effect-motion";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AnyScene, usePlayer } from "../src/usePlayer";

/** controllable FontFace: loads settle only when the test says so */
class StubFontFace {
	static instances: Array<StubFontFace> = [];
	private resolveLoad!: (face: StubFontFace) => void;
	private rejectLoad!: (error: unknown) => void;
	private readonly promise = new Promise<StubFontFace>((resolve, reject) => {
		this.resolveLoad = resolve;
		this.rejectLoad = reject;
	});
	constructor(
		readonly family: string,
		readonly source: string,
		readonly descriptors?: Record<string, string>,
	) {
		StubFontFace.instances.push(this);
	}
	load() {
		return this.promise;
	}
	settle() {
		this.resolveLoad(this);
	}
	fail(error: unknown) {
		this.rejectLoad(error);
	}
}

const added: Array<unknown> = [];

beforeEach(() => {
	StubFontFace.instances = [];
	added.length = 0;
	vi.stubGlobal("FontFace", StubFontFace);
	Object.defineProperty(document, "fonts", {
		value: { add: (face: unknown) => added.push(face) },
		configurable: true,
	});
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const textScene = () =>
	Scene.make(function* () {
		yield* Scene.instantiate(Shapes.Text, { text: "hi", x: 10, y: 10 });
		yield* Scene.tick;
	}) as AnyScene;

describe("usePlayer font loading", () => {
	it("holds ready until declared url fonts settle, with descriptors applied", async () => {
		const scene = textScene().annotate(Fonts.Fonts, [
			{
				family: "Inter",
				src: { url: "/fonts/inter-bold.woff2" },
				weight: 700,
				style: "italic",
			},
		]) as AnyScene;
		const { result } = renderHook(() => usePlayer(scene));

		await waitFor(() =>
			expect(result.current.bufferedFrames).toBeGreaterThan(0),
		);
		expect(result.current.status).toBe("loading");
		expect(added).toHaveLength(1);
		const face = StubFontFace.instances[0]!;
		expect(face.family).toBe("Inter");
		expect(face.source).toBe("url(/fonts/inter-bold.woff2)");
		expect(face.descriptors).toEqual({ weight: "700", style: "italic" });

		act(() => face.settle());
		await waitFor(() => expect(result.current.status).toBe("ready"));
	});

	it("a rejecting font load warns and still reaches ready", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const scene = textScene().annotate(Fonts.Fonts, [
			{ family: "Ghost", src: { url: "/fonts/missing.woff2" } },
		]) as AnyScene;
		const { result } = renderHook(() => usePlayer(scene));

		await waitFor(() =>
			expect(result.current.bufferedFrames).toBeGreaterThan(0),
		);
		act(() => StubFontFace.instances[0]!.fail(new Error("404")));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(warn).toHaveBeenCalledOnce();
		warn.mockRestore();
	});

	it("path-only entries attempt no load and do not gate readiness", async () => {
		const scene = textScene().annotate(Fonts.Fonts, [
			{ family: "Inter", src: { path: "./fonts/Inter.ttf" } },
		]) as AnyScene;
		const { result } = renderHook(() => usePlayer(scene));

		await waitFor(() => expect(result.current.status).toBe("ready"));
		expect(StubFontFace.instances).toHaveLength(0);
		expect(added).toHaveLength(0);
	});
});
