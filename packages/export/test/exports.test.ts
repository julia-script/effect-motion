import { existsSync, readFileSync } from "node:fs";
import { expect, it } from "vitest";

const pkg = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { exports: Record<string, { types: string; default: string }> };

it.each([
	"Frames",
	"Stills",
	"Video",
])("deep-imports @effect-motion/export/%s", (module) => {
	expect(pkg.exports[`./${module}`]).toEqual({
		types: `./dist/${module}.d.ts`,
		default: `./dist/${module}.js`,
	});
	expect(existsSync(new URL(`../src/${module}.ts`, import.meta.url))).toBe(
		true,
	);
});
