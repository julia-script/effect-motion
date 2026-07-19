import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Images from "../src/Images";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/Shapes";

const logo: Images.ImageResource = {
	name: "logo",
	src: { url: "/img/logo.png" },
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

describe("Images", () => {
	it("annotated scenes expose their declaration; the original stays empty", () => {
		const scene = circleScene();
		const annotated = scene.annotate(Images.Images, [logo]);
		expect(Images.get(annotated)).toEqual([logo]);
		expect(Images.get(scene)).toEqual([]);
	});

	it("unannotated scenes read as empty", () => {
		expect(Images.get(circleScene())).toEqual([]);
		expect(Images.urlMap(circleScene())).toEqual({});
	});

	it("urlMap includes url entries and skips path-only ones", () => {
		const annotated = circleScene().annotate(Images.Images, [
			logo,
			{ name: "local-only", src: { path: "/tmp/x.png" } },
		]);
		expect(Images.urlMap(annotated)).toEqual({ logo: "/img/logo.png" });
	});

	it("the annotation does not affect frame production", async () => {
		const scene = circleScene();
		const plain = await collectData(scene);
		const annotated = await collectData(scene.annotate(Images.Images, [logo]));
		expect(plain.length).toBeGreaterThan(0);
		expect(annotated).toEqual(plain);
	});

	it("Image entity: image required, size keys absent unless set", () => {
		const data = Shapes.Image.data.make({ image: "logo" });
		expect(data).toMatchObject({ image: "logo", x: 0, y: 0, z: 0, opacity: 1 });
		expect("width" in data).toBe(false);
		expect("height" in data).toBe(false);
		const sized = Shapes.Image.data.make({
			image: "logo",
			width: 40,
			height: 20,
		});
		expect(sized).toMatchObject({ width: 40, height: 20 });
	});
});
