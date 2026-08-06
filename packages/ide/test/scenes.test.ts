import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as Scenes from "../src/Scenes";

const EXAMPLES = fileURLToPath(
	new URL("../../../apps/docs/examples", import.meta.url),
);

const barrel = (body: string) =>
	`import { Color, Motion, Scene } from "effect-motion";\n${body}`;

describe("scene declarations", () => {
	it("finds an exported scene and its binding name", () => {
		const found = Scenes.scenes(
			barrel(`export const scene = Scene.make(function* () {});`),
		);
		expect(found).toHaveLength(1);
		expect(found[0]?.name).toBe("scene");
		expect(found[0]?.displayName).toBeUndefined();
	});

	it("reads the display name when there is one", () => {
		expect(
			Scenes.scenes(
				barrel(
					`export const scene = Scene.make("Hello World", function* () {});`,
				),
			)[0]?.displayName,
		).toBe("Hello World");
	});

	it("follows a deep import's alias", () => {
		const source = `import * as S from "effect-motion/Scene";\nexport const scene = S.make(function* () {});`;
		expect(Scenes.scenes(source)).toHaveLength(1);
	});

	it("does not claim an unrelated .make call", () => {
		expect(
			Scenes.scenes(barrel(`const schema = Schema.make(function* () {});`)),
		).toEqual([]);
	});

	it("does nothing in a file that never imports effect-motion", () => {
		expect(
			Scenes.scenes(`export const scene = Scene.make(function* () {});`),
		).toEqual([]);
	});

	it("anchors on the declaration, not the newline before it", () => {
		const source = barrel(`export const scene = Scene.make(function* () {});`);
		const offset = Scenes.scenes(source)[0]?.offset ?? -1;
		expect(source.slice(offset, offset + 6)).toBe("export");
	});
});

describe("entrypoints", () => {
	it("finds a studio entrypoint", () => {
		const source = `import { studioConfig } from "@effect-motion/cli";\nexport default studioConfig({ scenes: {} });`;
		const found = Scenes.anchors(source);
		expect(found.map((anchor) => anchor.kind)).toEqual(["studio"]);
		expect(
			source.slice(found[0]?.offset ?? 0, (found[0]?.offset ?? 0) + 12),
		).toBe("studioConfig");
	});

	it("finds a render entrypoint and the scene it renders", () => {
		const source = `import { Video } from "@effect-motion/export";\nyield* Video.render(main, "./out.mp4");`;
		const found = Scenes.anchors(source);
		expect(found.map((anchor) => anchor.kind)).toEqual(["render"]);
		expect(found[0]?.name).toBe("main");
	});

	it("ignores render calls in a file that does not import the export package", () => {
		expect(Scenes.anchors(`renderer.render(scene);`)).toEqual([]);
	});
});

describe("against the real example scenes", () => {
	const files = readdirSync(EXAMPLES).filter((name) =>
		name.endsWith(".scene.ts"),
	);

	it("has example scenes to check", () => {
		expect(files.length).toBeGreaterThan(20);
	});

	it.each(files)("finds every Scene.make in %s", (name) => {
		const source = readFileSync(`${EXAMPLES}/${name}`, "utf8");
		const found = Scenes.scenes(source);
		// the ground truth: one anchor per `= <ns>.make(` in the file
		const declared = source.match(/=\s*[A-Za-z_$][A-Za-z0-9_$]*\.make\s*\(/g);
		expect(found).toHaveLength(declared?.length ?? 0);
		expect(found.map((anchor) => anchor.name)).toContain("scene");
	});
});
