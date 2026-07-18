import { describe, expect, it } from "vitest";
import { MotionCliError, renderForTerminal } from "../src/MotionCliError";

describe("MotionCliError", () => {
	const wrapped = new MotionCliError({
		reason: "RenderFailed",
		message: 'target "intro" failed to render',
		cause: new Error("ffmpeg exited with code 1"),
	});

	it("renders message-only without verbose (no stack trace)", () => {
		const out = renderForTerminal(wrapped, false);
		expect(out).toBe('error(RenderFailed): target "intro" failed to render');
		expect(out).not.toContain("ffmpeg");
	});

	it("renders the cause chain under verbose", () => {
		const out = renderForTerminal(wrapped, true);
		expect(out).toContain("caused by:");
		expect(out).toContain("ffmpeg exited with code 1");
	});

	it("walks nested causes", () => {
		const inner = new Error("root cause");
		const middle = new Error("wrapper", { cause: inner });
		const error = new MotionCliError({
			reason: "SceneLoadFailed",
			message: "failed to load x.ts",
			cause: middle,
		});
		const out = renderForTerminal(error, true);
		expect(out).toContain("wrapper");
		expect(out).toContain("root cause");
	});

	it("is a tagged error usable in Effect catchTag", () => {
		expect(wrapped._tag).toBe("MotionCliError");
	});
});
