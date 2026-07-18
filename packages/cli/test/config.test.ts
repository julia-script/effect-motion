import { describe, expect, it } from "vitest";
import { resolveTarget, validateConfig } from "../src/Config";
import { MotionCliError } from "../src/MotionCliError";

const CONFIG = "/proj/motion.config.ts";

describe("validateConfig", () => {
	it("accepts a minimal valid config", () => {
		const config = {
			targets: [{ name: "a", scene: "./src/a.ts" }],
		};
		expect(validateConfig(config, CONFIG)).toBe(config);
	});

	it("rejects a missing default export shape", () => {
		expect(() => validateConfig(undefined, CONFIG)).toThrow(MotionCliError);
		expect(() => validateConfig({}, CONFIG)).toThrow(/targets/);
	});

	it("rejects duplicate target names, naming the duplicate", () => {
		expect(() =>
			validateConfig(
				{
					targets: [
						{ name: "a", scene: "./a.ts" },
						{ name: "a", scene: "./b.ts" },
					],
				},
				CONFIG,
			),
		).toThrow(/duplicate target name "a"/);
	});

	it("rejects a target without a scene, naming the target", () => {
		expect(() => validateConfig({ targets: [{ name: "a" }] }, CONFIG)).toThrow(
			/"a" is missing a `scene`/,
		);
	});

	it("rejects unsupported formats", () => {
		expect(() =>
			validateConfig(
				{ targets: [{ name: "a", scene: "./a.ts", format: "webm" }] },
				CONFIG,
			),
		).toThrow(/unsupported format "webm"/);
	});

	it("errors name the config file", () => {
		try {
			validateConfig({}, CONFIG);
			expect.unreachable();
		} catch (error) {
			expect((error as MotionCliError).message).toContain(CONFIG);
			expect((error as MotionCliError).reason).toBe("ConfigInvalid");
		}
	});
});

describe("resolveTarget", () => {
	const target = {
		name: "intro",
		scene: "./src/scenes/intro.ts",
		settings: { width: 1920, height: 1080, frameRate: 60, dpr: 2 },
	};

	it("derives <output>/<name>.<format> with defaults", () => {
		const resolved = resolveTarget(target);
		expect(resolved.outDir).toBe("./output");
		expect(resolved.fileName).toBe("intro.mp4");
	});

	it("respects target output and format", () => {
		const resolved = resolveTarget({
			...target,
			output: "./renders",
		});
		expect(resolved.outDir).toBe("./renders");
		expect(resolved.fileName).toBe("intro.mp4");
	});

	it("flags beat target config (precedence)", () => {
		const resolved = resolveTarget(target, {
			frameRate: 30,
			outDir: "./elsewhere",
		});
		expect(resolved.settings.frameRate).toBe(30);
		expect(resolved.settings.width).toBe(1920);
		expect(resolved.outDir).toBe("./elsewhere");
	});

	it("keeps dpr inside settings and does not invent defaults", () => {
		const resolved = resolveTarget({ name: "a", scene: "./a.ts" });
		// undefined settings let the Runner's own defaults apply downstream
		expect(resolved.settings).toEqual({});
		expect(resolved.frames).toBeUndefined();
		const withDpr = resolveTarget(target, { dpr: 3 });
		expect(withDpr.settings.dpr).toBe(3);
	});

	it("frames comes from override or target", () => {
		expect(resolveTarget({ ...target, frames: 10 }).frames).toBe(10);
		expect(resolveTarget({ ...target, frames: 10 }, { frames: 5 }).frames).toBe(
			5,
		);
	});
});
