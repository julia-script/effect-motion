import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Color, Entity as S, Scene } from "effect-motion";
import { afterAll, expect, it } from "vitest";

// Encoding uses the bundled ffmpeg-static binary, so no system ffmpeg is
// needed. The test only gates on `ffprobe` — a system tool it uses to
// VERIFY the output (ffmpeg-static ships ffmpeg, not ffprobe).
const has = (bin: string) => {
	try {
		execFileSync(bin, ["-version"], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};
const canVerify = has("ffprobe");

const dir = canVerify ? mkdtempSync(join(tmpdir(), "effect-motion-e2e-")) : "";
afterAll(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
});

// import after gate check so the module still loads when skipped
const scene = Scene.make(
	function* () {
		yield* Scene.instantiate("Circle", {
			position: S.vec3({ x: 100, y: 60 }),
			radius: 30,
			fillColor: Color.hex("#fde68a"),
		});
		yield* Scene.instantiate("Rect", {
			position: S.vec3({ x: 20, y: 20 }),
			width: 40,
			height: 40,
			fillColor: Color.hex("#7c3aed"),
		});
		for (let i = 0; i < 9; i++) yield* Scene.tick;
	},
	{ width: 240, height: 120 },
);

it.runIf(canVerify)(
	"renders a scene to a real playable MP4 end-to-end",
	async () => {
		const { Video } = await import("../src");
		const out = join(dir, "clip.mp4");

		await Effect.runPromise(
			Video.render(scene, out, {
				settings: { frameRate: 10 },
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

// the standalone render-program contract (video-encoding spec): loader
// layers + NodeServices in one pipe — exactly what a render.ts writes —
// with the output landing in a directory that does not exist yet
it.runIf(canVerify)(
	"standalone pipe: loader layers + NodeServices, output dir created",
	async () => {
		const { Video } = await import("../src");
		const {
			Image,
			Scene: SceneMod,
			Entity: EntitiesMod,
		} = await import("effect-motion");
		const { encodePng } = await import("@effect-motion/renderer/node");

		const rgba = new Uint8Array(8 * 8 * 4);
		for (let i = 0; i < rgba.length; i += 4) {
			rgba[i + 1] = 255;
			rgba[i + 3] = 255;
		}
		const greenPng = encodePng(rgba, 8, 8);
		const Dot = Image.Image("dot");

		const withImage = SceneMod.make(
			function* () {
				const dot = yield* Dot;
				yield* SceneMod.instantiate("Image", {
					image: dot,
					position: EntitiesMod.vec3({ x: 30, y: 30 }),
					width: 40,
					height: 40,
				});
				for (let i = 0; i < 3; i++) yield* SceneMod.tick;
			},
			{ width: 120, height: 80 },
		);

		const out = join(dir, "fresh", "nested", "asset.mp4");
		await Effect.runPromise(
			Video.render(withImage as never, out, {
				settings: { frameRate: 10 },
			}).pipe(
				Effect.provide(Image.layer(Dot, Effect.succeed(greenPng))),
				Effect.provide(NodeServices.layer),
			) as Effect.Effect<void>,
		);
		expect(existsSync(out)).toBe(true);
	},
	30_000,
);
