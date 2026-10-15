import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import { describe, expect, it } from "vitest";
import {
	causeLine,
	failWithCause,
	MotionCliError,
	renderForTerminal,
} from "../src/MotionCliError";

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

	it("causeLine is the squashed cause's name and first message line", () => {
		expect(causeLine(new TypeError("bad\nmore"))).toBe("TypeError: bad");
		expect(causeLine(Cause.die(new RangeError("oops")))).toBe(
			"RangeError: oops",
		);
		expect(causeLine("plain")).toBe("plain");
	});

	it("failWithCause wraps failures and defects, passes MotionCliError through", async () => {
		const wrap = failWithCause("RenderFailed", "scene failed");
		const died = await Effect.runPromise(
			Effect.flip(wrap(Effect.die(new TypeError("boom")))),
		);
		expect(died.message).toBe("scene failed: TypeError: boom");
		expect(died.cause).toBeInstanceOf(TypeError);
		const passed = await Effect.runPromise(
			Effect.flip(wrap(Effect.fail(wrapped))),
		);
		expect(passed).toBe(wrapped);
		const interrupted = await Effect.runPromiseExit(wrap(Effect.interrupt));
		expect(
			interrupted._tag === "Failure" &&
				Cause.hasInterruptsOnly(interrupted.cause),
		).toBe(true);
	});

	it("is a tagged error usable in Effect catchTag", () => {
		expect(wrapped._tag).toBe("MotionCliError");
	});
});
