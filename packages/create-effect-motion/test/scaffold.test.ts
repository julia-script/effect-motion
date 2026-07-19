import { execFileSync, execSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeServices } from "@effect/platform-node";
import * as Effect from "effect/Effect";
import { afterAll, describe, expect, it } from "vitest";
import { gitInit } from "../src/create";
import type { MotionCliError } from "../src/MotionCliError";
import { COMPANIONS, PINS } from "../src/pins";
import { ensureEmptyDir, scaffoldProject } from "../src/scaffold";

const root = mkdtempSync(join(tmpdir(), "create-effect-motion-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const run = <A, E>(effect: Effect.Effect<A, E, unknown>) =>
	Effect.runPromise(
		Effect.provide(
			effect as Effect.Effect<A, E, never>,
			NodeServices.layer,
		) as Effect.Effect<A, E>,
	);

describe("scaffold", () => {
	it("produces the specced project tree with exact pins", async () => {
		const dir = join(root, "demo-reel");
		await run(scaffoldProject(dir, "demo-reel", { biome: false }));

		for (const file of [
			"package.json",
			"tsconfig.json",
			".gitignore",
			"AGENTS.md",
			"motion.config.ts",
			"src/scenes/hello-world.ts",
			"src/main.ts",
			"src/assets/.gitkeep",
		]) {
			expect(existsSync(join(dir, file)), file).toBe(true);
		}
		// the template's underscore name must not leak
		expect(existsSync(join(dir, "_gitignore"))).toBe(false);

		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		expect(pkg.name).toBe("demo-reel");
		// exact pins, never ranges — the effect pin is a determinism invariant
		expect(pkg.dependencies.effect).toBe(PINS.effect);
		expect(pkg.dependencies["effect-motion"]).toBe(PINS["effect-motion"]);
		expect(pkg.dependencies["@effect-motion/react"]).toBe(
			PINS["@effect-motion/react"],
		);
		expect(pkg.dependencies["@effect-motion/export"]).toBe(
			PINS["@effect-motion/export"],
		);
		expect(pkg.devDependencies["@effect-motion/cli"]).toBe(
			PINS["@effect-motion/cli"],
		);
		for (const version of [
			pkg.dependencies.effect,
			pkg.dependencies["effect-motion"],
		]) {
			expect(version).not.toMatch(/^[\^~]|latest/);
		}
		expect(readFileSync(join(dir, ".gitignore"), "utf8")).toContain("output/");
	});

	it("refuses a non-empty directory but tolerates dotfiles", async () => {
		const dirty = join(root, "dirty");
		await run(scaffoldProject(dirty, "dirty", { biome: false }));
		await expect(run(ensureEmptyDir(dirty))).rejects.toThrow(/not empty/);

		const dotted = join(root, "dotted");
		await run(
			Effect.gen(function* () {
				yield* ensureEmptyDir(join(root, "does-not-exist-yet"));
			}),
		);
		// a directory holding only dotfiles (e.g. fresh `git init`) is fine
		const fs = await import("node:fs");
		fs.mkdirSync(dotted, { recursive: true });
		writeFileSync(join(dotted, ".gitkeep"), "");
		await run(ensureEmptyDir(dotted));
	});

	it("failures carry the ScaffoldTargetNotEmpty reason", async () => {
		const dirty = join(root, "dirty");
		const result = await run(
			Effect.result(ensureEmptyDir(dirty)) as Effect.Effect<
				{ _tag: string; failure?: MotionCliError },
				never,
				unknown
			>,
		);
		expect(result._tag).toBe("Failure");
		expect(result.failure?.reason).toBe("ScaffoldTargetNotEmpty");
	});
});

describe("biome option", () => {
	it("declined: no biome.json, no dependency, no lint scripts", async () => {
		const dir = join(root, "no-biome");
		await run(scaffoldProject(dir, "no-biome", { biome: false }));

		expect(existsSync(join(dir, "biome.json"))).toBe(false);
		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		expect(pkg.devDependencies["@biomejs/biome"]).toBeUndefined();
		expect(pkg.scripts.lint).toBeUndefined();
	});

	it("selected: biome.json + dependency + lint scripts, and `biome check` is clean", async () => {
		const dir = join(root, "with-biome");
		await run(scaffoldProject(dir, "with-biome", { biome: true }));

		expect(existsSync(join(dir, "biome.json"))).toBe(true);
		const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
		expect(pkg.devDependencies["@biomejs/biome"]).toBe(
			COMPANIONS["@biomejs/biome"],
		);
		expect(pkg.scripts.lint).toBe("biome check .");
		expect(pkg.scripts["lint:fix"]).toBe("biome check --fix .");

		// the generated config must accept the template files as-is — a fresh
		// scaffold that fails its own lint script reads as a broken scaffold
		const require = createRequire(import.meta.url);
		const biomeBin = require.resolve("@biomejs/biome/bin/biome");
		expect(() =>
			execFileSync(process.execPath, [biomeBin, "check", "."], {
				cwd: dir,
				stdio: "pipe",
			}),
		).not.toThrow();
	});
});

describe("git init", () => {
	it("initializes a repository in a fresh project", async () => {
		const dir = join(root, "gitted");
		await run(scaffoldProject(dir, "gitted", { biome: false }));
		await run(gitInit(dir));
		expect(existsSync(join(dir, ".git"))).toBe(true);
	});

	it("skips inside an existing work tree", async () => {
		const outer = join(root, "outer");
		execSync("git init", { cwd: root, stdio: "ignore" });
		try {
			await run(scaffoldProject(outer, "outer", { biome: false }));
			await run(gitInit(outer));
			expect(existsSync(join(outer, ".git"))).toBe(false);
		} finally {
			rmSync(join(root, ".git"), { recursive: true, force: true });
		}
	});
});
