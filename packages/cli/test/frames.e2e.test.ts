import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { Command } from "effect/unstable/cli";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { CLI_VERSION, rootCommand } from "../src/cli";

const studio = join(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures",
	"basic",
	"studio.ts",
);
const outDir = mkdtempSync(join(tmpdir(), "motion-frames-e2e-"));
afterAll(() => rmSync(outDir, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

// run the CLI and capture what it printed to stdout
const runCli = async (args: ReadonlyArray<string>) => {
	const lines: Array<string> = [];
	vi.spyOn(console, "log").mockImplementation((line: unknown) => {
		lines.push(String(line));
	});
	await Effect.runPromise(
		Command.runWith(rootCommand, { version: CLI_VERSION })([
			"frames",
			...args,
			"--studio",
			studio,
		]).pipe(Effect.provide(NodeServices.layer)) as Effect.Effect<void>,
	);
	return lines.join("\n");
};

// PNG IHDR: width/height are big-endian u32 at bytes 16 and 20
const pngSize = (file: string) => {
	const bytes = readFileSync(file);
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

// dot: 120×80, 5 frames (0–4)
describe("motion frames (e2e)", () => {
	it("lists the scene keys when no scene is given", async () => {
		expect(await runCli([])).toBe("dot");
	});

	it("fails listing the keys for an unknown scene", async () => {
		await expect(runCli(["nope"])).rejects.toThrow(/available: dot/);
	});

	it("writes one still per frame, named by frame index", async () => {
		const out = join(outDir, "stills");
		const printed = await runCli(["dot", "--at", "0,end", "--out", out]);
		for (const frame of ["0000", "0004"]) {
			const file = join(out, `${frame}.png`);
			expect(existsSync(file)).toBe(true);
			expect(pngSize(file)).toEqual({ width: 120, height: 80 });
		}
		expect(printed).toMatch(/0000\.png frame=0 time=0s/);
		expect(printed).toMatch(/0004\.png frame=4 time=/);
	});

	it("writes a contact sheet and prints the tile map", async () => {
		const out = join(outDir, "sheet");
		const printed = await runCli([
			"dot",
			"--count",
			"4",
			"--sheet",
			"--out",
			out,
		]);
		expect(existsSync(join(out, "sheet.png"))).toBe(true);
		expect(existsSync(join(out, "0000.png"))).toBe(false);
		expect(printed).toMatch(/sheet\.png 2x2/);
		expect(printed.match(/^tile=\d+ frame=\d+ time=/gm)).toHaveLength(4);
	});

	it("prints JSON state to stdout with --json -", async () => {
		const printed = await runCli(["dot", "--at", "end", "--json", "-"]);
		const [state] = JSON.parse(printed);
		expect(state).toMatchObject({ frame: 4, width: 120, height: 80 });
		expect(Object.keys(state.instances).length).toBeGreaterThan(0);
	});

	it("writes JSON to a file without rendering stills", async () => {
		const out = join(outDir, "json");
		const file = join(out, "frames.json");
		await runCli(["dot", "--count", "100", "--json", file, "--out", out]);
		// --count past the scene length clamps: every frame once
		const frames = JSON.parse(readFileSync(file, "utf8")).map(
			(s: { frame: number }) => s.frame,
		);
		expect(frames).toEqual([0, 1, 2, 3, 4]);
		expect(existsSync(join(out, "0000.png"))).toBe(false);
	});

	it("fails naming the bad selector", async () => {
		await expect(runCli(["dot", "--at", "soon"])).rejects.toThrow(/"soon"/);
	});
});
