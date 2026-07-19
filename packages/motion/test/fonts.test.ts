import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Fonts from "../src/Fonts";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";

const inter: Fonts.FontResource = {
	family: "Inter",
	src: { url: "/fonts/inter.woff2" },
};

const circleScene = () =>
	Scene.make(function* () {
		const c = yield* Scene.instantiate(Shapes.Circle, { x: 0, radius: 5 });
		yield* Scene.update(c, (d) => ({ ...d, x: 10 }));
		yield* Scene.tick;
	} as never);

const collectData = async (scene: unknown): Promise<any[]> =>
	[
		...((await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<any>, never, never>,
		)) as Iterable<any>),
	].map((f) =>
		Object.entries(f.instances)
			.filter(([id]) => id !== f.root)
			.map(([, e]: any) => e.data),
	);

describe("Fonts", () => {
	it("annotated scenes expose their declaration; the original stays empty", () => {
		const scene = circleScene();
		const annotated = scene.annotate(Fonts.Fonts, [inter]);
		expect(Fonts.get(annotated)).toEqual([inter]);
		expect(Fonts.get(scene)).toEqual([]);
	});

	it("unannotated scenes read as empty", () => {
		expect(Fonts.get(circleScene())).toEqual([]);
	});

	it("the annotation does not affect frame production", async () => {
		const scene = circleScene();
		const plain = await collectData(scene);
		const annotated = await collectData(scene.annotate(Fonts.Fonts, [inter]));
		expect(plain.length).toBeGreaterThan(0);
		expect(annotated).toEqual(plain);
	});
});
