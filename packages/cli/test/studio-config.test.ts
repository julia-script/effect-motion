import type * as Layer from "effect/Layer";
import type * as Font from "effect-motion/Font";
import * as Scene from "effect-motion/Scene";
import { describe, expect, it } from "vitest";
import { MotionCliError } from "../src/MotionCliError";
import { resolveEntries, studioConfig } from "../src/StudioConfig";

const FILE = "/proj/studio.ts";

const plain = Scene.make(function* () {});
const named = Scene.make("The Grand Orbit", function* () {});

// ── type-level assertions (enforced by `pnpm check`; vitest doesn't typecheck)

type LoaderScene = Scene.Scene<never, Font.FontLoader<"Pacifico">>;
declare const loaderScene: LoaderScene;
declare const pacificoLayer: Layer.Layer<Font.FontLoader<"Pacifico">>;
declare const wrongLayer: Layer.Layer<Font.FontLoader<"Inter">>;

// never invoked — compile-time assertions only
const _typeCases = () => {
	// loader-free scenes: layers forbidden
	const loaderFree = studioConfig({ scenes: { plain, named } });
	const loaderFreeRejects = studioConfig({
		scenes: { plain },
		// @ts-expect-error a loader-free studio must not receive layers
		layers: pacificoLayer,
	});

	// a resource-carrying scene REQUIRES covering layers
	const covered = studioConfig({
		scenes: { plain, fancy: loaderScene },
		layers: pacificoLayer,
	});
	// @ts-expect-error missing layers for the registered loader scene
	const uncovered = studioConfig({ scenes: { fancy: loaderScene } });
	const wrongCoverage = studioConfig({
		scenes: { fancy: loaderScene },
		// @ts-expect-error layers must cover FontLoader<"Pacifico">, not Inter
		layers: wrongLayer,
	});

	// entry objects participate in the union like bare scenes
	const entryCovered = studioConfig({
		scenes: { fancy: { scene: loaderScene, fps: 30, autoPlay: true } },
		layers: pacificoLayer,
	});
	// @ts-expect-error an entry object's scene still demands its loader
	const entryUncovered = studioConfig({
		scenes: { fancy: { scene: loaderScene, fps: 30 } },
	});

	// (duplicate record keys need no assertion: an object literal with two
	// identical properties is a TypeScript error by construction)

	return [
		loaderFree,
		loaderFreeRejects,
		covered,
		uncovered,
		wrongCoverage,
		entryCovered,
		entryUncovered,
	];
};

// ── runtime: brand check + entry normalization ──────────────────────────────

describe("studioConfig typing", () => {
	it("type-level cases stay referenced for the typechecker", () => {
		expect(typeof _typeCases).toBe("function");
	});
});

describe("resolveEntries", () => {
	it("normalizes bare scenes and entry objects, labeling by name ?? key", () => {
		const entries = resolveEntries(
			studioConfig({
				scenes: {
					"hello-world": plain,
					orbit: { scene: named, fps: 30 },
				},
			}),
			FILE,
		);
		expect(entries.map((e) => e.key)).toEqual(["hello-world", "orbit"]);
		expect(entries.map((e) => e.label)).toEqual([
			"hello-world",
			"The Grand Orbit",
		]);
		expect(entries[1]?.options).toEqual({ fps: 30 });
		expect(entries[0]?.scene).toBe(plain);
	});

	it("rejects a non-branded default export naming the file", () => {
		expect(() => resolveEntries({ scenes: { plain } }, FILE)).toThrow(
			/studio\.ts.*studioConfig/,
		);
	});

	it("rejects a bad entry naming the key", () => {
		const config = studioConfig({ scenes: { plain } }) as {
			scenes: Record<string, unknown>;
		};
		config.scenes.broken = { notAScene: true };
		expect(() => resolveEntries(config, FILE)).toThrow(/scenes\["broken"\]/);
	});

	it("rejects an empty registration", () => {
		expect(() => resolveEntries(studioConfig({ scenes: {} }), FILE)).toThrow(
			/no scenes/,
		);
	});

	it("failures are MotionCliError with ConfigInvalid", () => {
		try {
			resolveEntries(null, FILE);
			expect.unreachable();
		} catch (error) {
			expect(error).toBeInstanceOf(MotionCliError);
			expect((error as MotionCliError).reason).toBe("ConfigInvalid");
		}
	});
});
