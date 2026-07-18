import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";
import { afterAll, describe, expect, it } from "vitest";
import { CLI_VERSION, rootCommand } from "../src/cli";

// gate on ffprobe like the export package's e2e: ffmpeg itself is bundled
// (ffmpeg-static), ffprobe is only needed to VERIFY the output
const has = (bin: string) => {
	try {
		execFileSync(bin, ["-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};
const canVerify = has("ffprobe");

const fixture = join(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures",
	"basic",
);
const configPath = join(fixture, "motion.config.ts");
const outDir = canVerify ? mkdtempSync(join(tmpdir(), "motion-cli-e2e-")) : "";
afterAll(() => {
	if (outDir) rmSync(outDir, { recursive: true, force: true });
});

const runCli = (args: ReadonlyArray<string>) =>
	Effect.runPromise(
		Command.runWith(rootCommand, { version: CLI_VERSION })(args).pipe(
			Effect.provide(NodeServices.layer),
		) as Effect.Effect<void>,
	);

const probe = (file: string) =>
	execFileSync("ffprobe", [
		"-v",
		"error",
		"-select_streams",
		"v:0",
		"-count_frames",
		"-show_entries",
		"stream=nb_read_frames,width,height,r_frame_rate",
		"-of",
		"default=noprint_wrappers=1",
		file,
	]).toString();

describe.runIf(canVerify)("motion render (e2e)", () => {
	it("renders all config targets to derived paths, honoring dpr", async () => {
		await runCli(["render", "--config", configPath, "--out-dir", outDir]);

		const plain = join(outDir, "dot.mp4");
		const hd = join(outDir, "dot-hd.mp4");
		expect(existsSync(plain)).toBe(true);
		expect(existsSync(hd)).toBe(true);

		// dot: 120x80@10, 5 frames (4 ticks + initial)
		const plainProbe = probe(plain);
		expect(plainProbe).toContain("width=120");
		expect(plainProbe).toContain("height=80");
		expect(plainProbe).toContain("nb_read_frames=5");
		expect(plainProbe).toContain("r_frame_rate=10/1");

		// dot-hd: same scene, dpr 2 → 240x160 pixels
		const hdProbe = probe(hd);
		expect(hdProbe).toContain("width=240");
		expect(hdProbe).toContain("height=160");
	});

	it("renders a single named target with flag overrides beating config", async () => {
		const dir = join(outDir, "named");
		await runCli([
			"render",
			"--config",
			configPath,
			"--out-dir",
			dir,
			"--fps",
			"5",
			"dot",
		]);
		expect(existsSync(join(dir, "dot.mp4"))).toBe(true);
		expect(existsSync(join(dir, "dot-hd.mp4"))).toBe(false);
		expect(probe(join(dir, "dot.mp4"))).toContain("r_frame_rate=5/1");
	});

	it("configless mode renders a scene file directly", async () => {
		const dir = join(outDir, "configless");
		const previousCwd = process.cwd();
		process.chdir(fixture);
		try {
			await runCli([
				"render",
				"./src/scenes/dot.ts",
				"--out-dir",
				dir,
				"--width",
				"100",
				"--height",
				"60",
				"--fps",
				"10",
			]);
		} finally {
			process.chdir(previousCwd);
		}
		const out = join(dir, "dot.mp4");
		expect(existsSync(out)).toBe(true);
		expect(probe(out)).toContain("width=100");
	});

	it("fails with UnknownTarget for a name not in the config", async () => {
		await expect(
			runCli(["render", "--config", configPath, "nope"]),
		).rejects.toThrow(/unknown target/i);
	});
});
