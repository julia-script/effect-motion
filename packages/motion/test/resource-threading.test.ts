import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Font from "../src/Font";
import * as Renderer from "../src/Renderer";
import type * as Resource from "../src/Resource";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";
import { unreachable } from "./support/raise";

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;

const RobotoFont = Font.Font("Roboto");

const scene = Scene.make(function* () {
	const font = yield* RobotoFont;
	yield* Scene.instantiate(Shapes.Circle, { x: 10, y: 10, radius: 5 });
	// the font value is plain data for props; nothing dereferences bytes here
	expect(font.id).toBe("Roboto");
	yield* Scene.tick;
});

// the scene's frames carry the loader; Scene.Resources extracts it
type SceneT = typeof scene;
type _resources = Assert<
	Equal<Scene.Resources<SceneT>, Font.FontLoader<"Roboto">>
>;

describe("resource threading", () => {
	it("a scene declaring a font runs with no loader provided", async () => {
		// THE guard for the erasure seam (design D3): loader requirements are
		// phantom, so frame production must succeed with an empty context
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<
				Iterable<Scene.Frame<Font.FontLoader<"Roboto">>>,
				never,
				never
			>,
		).then((chunk) => [...chunk]);
		expect(frames.length).toBeGreaterThan(0);
		const frame = frames.at(-1) ?? unreachable();
		expect(Object.keys(frame.instances).length).toBeGreaterThan(0);
	});

	it("frames of a loader-free scene are Frame<never>", () => {
		const plain = Scene.make(function* () {
			yield* Scene.tick;
		});
		type _noResources = Assert<
			Equal<Resource.ExtractLoaders<Scene.Resources<typeof plain>>, never>
		>;
		expect(plain.width).toBeGreaterThan(0);
	});

	it("Frame phantoms are not interchangeable", () => {
		// structural erasure would let Frame<FontLoader> flow where Frame<never>
		// is expected; the phantom field must block it
		type _blocked = Assert<
			Equal<
				Scene.Frame<Font.FontLoader<"Roboto">> extends Scene.Frame<never>
					? true
					: false,
				false
			>
		>;
		expect(true).toBe(true);
	});
});

// rendering a resource-carrying frame REQUIRES its loaders in the effect's
// requirements — the whole point of the threading (never invoked; type-only)
type EffectR<T> =
	T extends Effect.Effect<infer _A, infer _E, infer R> ? R : never;
const _renderDemandsLoaders = (
	frame: Scene.Frame<Font.FontLoader<"Roboto">>,
) => {
	const eff = Renderer.render(frame);
	type _requiresLoader = Assert<
		Equal<
			Resource.ExtractLoaders<EffectR<typeof eff>>,
			Font.FontLoader<"Roboto">
		>
	>;
	return eff;
};

export type _keep = [_resources];
export const _keepValues = [_renderDemandsLoaders];
