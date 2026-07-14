import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Scene, Shapes } from "effect-motion";
import { afterAll, expect, it } from "vitest";

// gated: only runs when a real ffmpeg (and ffprobe) is on PATH
const has = (bin: string) => {
	try {
		execFileSync(bin, ["-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};
const ffmpegAvailable = has("ffmpeg") && has("ffprobe");

const dir = ffmpegAvailable
	? mkdtempSync(join(tmpdir(), "effect-motion-e2e-"))
	: "";
afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

// import after gate check so the module still loads when skipped
const scene = Scene.make(function* () {
	yield* Scene.instantiate(Shapes.Circle, {
		x: 100,
		y: 60,
		radius: 30,
		fill: "#fde68a",
	});
	yield* Scene.instantiate(Shapes.Rect, {
		x: 20,
		y: 20,
		width: 40,
		height: 40,
		fill: "#7c3aed",
	});
	for (let i = 0; i < 9; i++) yield* Scene.tick;
});

it.runIf(ffmpegAvailable)(
	"renders a scene to a real playable MP4 end-to-end",
	async () => {
		const { Video } = await import("../src");
		const out = join(dir, "clip.mp4");

		await Effect.runPromise(
			Video.render(scene, out, {
				settings: { width: 240, height: 120, frameRate: 10 },
			}).pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<void>,
		);

		expect(existsSync(out)).toBe(true);

		// probe: 10 frames (9 ticks + initial) at 240x120
		const probe = execFileSync("ffprobe", [
			"-v",
			"error",
			"-select_streams",
			"v:0",
			"-count_frames",
			"-show_entries",
			"stream=nb_read_frames,width,height",
			"-of",
			"default=noprint_wrappers=1",
			out,
		]).toString();

		expect(probe).toContain("width=240");
		expect(probe).toContain("height=120");
		expect(probe).toContain("nb_read_frames=10");
	},
	30_000,
);
