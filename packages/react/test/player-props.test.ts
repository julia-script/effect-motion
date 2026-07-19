import type * as Layer from "effect/Layer";
import type * as Font from "effect-motion/Font";
import type * as Runner from "effect-motion/Runner";
import type * as Scene from "effect-motion/Scene";
import { describe, expect, it } from "vitest";
import type { PlayerProps } from "../src/Player";

/**
 * PlayerProps conditional typing (react-player delta): a loader-free scene
 * takes no renderLayers; a resource-carrying scene REQUIRES a covering
 * layer. Enforced by `pnpm check` (vitest does not typecheck) — the
 * @ts-expect-error lines are the assertions.
 */

type PlainScene = Scene.Scene<never, Runner.Runner>;
type LoaderScene = Scene.Scene<
	never,
	Font.FontLoader<"Roboto"> | Runner.Runner
>;

declare const plainScene: PlainScene;
declare const loaderScene: LoaderScene;
declare const robotoLayer: Layer.Layer<Font.FontLoader<"Roboto">>;

// never invoked — compile-time assertions only
export const _cases = () => {
	// a loader-free scene compiles without renderLayers
	const plainOk: PlayerProps<PlainScene> = { scene: plainScene };

	const plainRejects: PlayerProps<PlainScene> = {
		scene: plainScene,
		// @ts-expect-error a loader-free scene must not receive renderLayers
		renderLayers: robotoLayer,
	};

	// a resource-carrying scene compiles WITH a covering layer
	const loaderOk: PlayerProps<LoaderScene> = {
		scene: loaderScene,
		renderLayers: robotoLayer,
	};

	// @ts-expect-error a resource-carrying scene without renderLayers is an error
	const loaderRejects: PlayerProps<LoaderScene> = { scene: loaderScene };

	return [plainOk, plainRejects, loaderOk, loaderRejects];
};

describe("PlayerProps", () => {
	it("type-level cases are asserted by the package typecheck", () => {
		expect(typeof _cases).toBe("function");
	});
});
