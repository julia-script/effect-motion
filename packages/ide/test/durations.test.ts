import * as Duration from "effect/Duration";
import * as Time from "effect-motion/Time";
import { describe, expect, it } from "vitest";
import * as Durations from "../src/Durations";

const CASES = [
	"1 second",
	"2 seconds",
	"400 millis",
	"1.5 seconds",
	"250 milli",
	"1 minute",
	"90 micros",
	"-1 second",
] as const;

describe("parsing", () => {
	it.each(CASES)("agrees with Effect on %s", (input) => {
		expect(Durations.toMillis(input)).toBeCloseTo(Duration.toMillis(input), 9);
	});

	it("rejects what Effect rejects", () => {
		for (const input of ["1second", "soon", "", "1000", "1 fortnight"])
			expect(Durations.toMillis(input), input).toBeUndefined();
	});

	it("tolerates surrounding whitespace", () => {
		expect(Durations.toMillis("  1 second  ")).toBe(1000);
	});
});

describe("frames", () => {
	it.each(CASES)("agrees with Time.toFrames on %s at 60fps", (input) => {
		const millis = Durations.toMillis(input) ?? Number.NaN;
		expect(Durations.toFrames(millis, 60)).toBe(Time.toFrames(input, 60));
	});

	it("describes a whole-frame duration as exact", () => {
		const info = Durations.describe("1 second", 60);
		expect(info).toEqual({
			millis: 1000,
			seconds: 1,
			frames: 60,
			frameRate: 60,
			rounded: false,
		});
	});

	it("flags a duration that does not land on a frame", () => {
		const info = Durations.describe("10 millis", 60);
		expect(info?.frames).toBe(1);
		expect(info?.rounded).toBe(true);
	});

	it("gives nothing back for a string it cannot read", () => {
		expect(Durations.describe("soon", 60)).toBeUndefined();
	});
});
