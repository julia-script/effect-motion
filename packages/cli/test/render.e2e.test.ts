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

const inFixture = async (fn: () => Promise<void>) => {
	const previousCwd = process.cwd();
	process.chdir(fixture);
	try {
		await fn();
	} finally {
		process.chdir(previousCwd);
	}
};

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
	it("executes the default render entrypoint (multiple outputs, dpr honored)", async () => {
		process.env.MOTION_OUT_DIR = outDir;
		try {
			await inFixture(() => runCli(["render"]));
		} finally {
			delete process.env.MOTION_OUT_DIR;
		}

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

	it("executes an explicit entrypoint path", async () => {
		const dir = join(outDir, "explicit");
		process.env.MOTION_OUT_DIR = dir;
		try {
			await runCli(["render", join(fixture, "render.ts")]);
		} finally {
			delete process.env.MOTION_OUT_DIR;
		}
		expect(existsSync(join(dir, "dot.mp4"))).toBe(true);
	});

	it("fails naming the path when no entrypoint exists", async () => {
		const empty = mkdtempSync(join(tmpdir(), "motion-cli-empty-"));
		const previousCwd = process.cwd();
		process.chdir(empty);
		try {
			await expect(runCli(["render"])).rejects.toThrow(/render\.ts/);
		} finally {
			process.chdir(previousCwd);
			rmSync(empty, { recursive: true, force: true });
		}
	});

	it("fails naming the file when the default export is not an Effect", async () => {
		await inFixture(async () => {
			await expect(runCli(["render", "./bad-render.ts"])).rejects.toThrow(
				/not an Effect/,
			);
		});
	});
});
