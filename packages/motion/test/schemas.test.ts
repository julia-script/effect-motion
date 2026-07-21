import { describe, expect, it } from "vitest";
import * as S from "../src/schemas";

describe("closed entity union", () => {
	it("every paintable entity shares the transform and appearance mixins", () => {
		const paintable = [
			S.Line,
			S.Path,
			S.Rect,
			S.Circle,
			S.Ellipse,
			S.Text,
			S.Group,
			S.Hud,
			S.Image,
		] as const;
		for (const entity of paintable) {
			const fields = Object.keys(entity.fields);
			expect(fields).toEqual(
				expect.arrayContaining([
					"position",
					"rotation",
					"scale",
					"opacity",
					"visible",
				]),
			);
		}
	});

	it("camera is the one non-paintable entity: transform only", () => {
		const fields = Object.keys(S.Camera.fields);
		expect(fields).toEqual(expect.arrayContaining(["position", "rotation"]));
		expect(fields).not.toContain("scale");
		expect(fields).not.toContain("opacity");
		expect(fields).not.toContain("visible");
	});

	it("defaults are identity: transform, appearance", () => {
		const rect = S.Rect.make({});
		expect(rect.position).toMatchObject({ x: 0, y: 0, z: 0 });
		expect(rect.rotation).toMatchObject({ x: 0, y: 0, z: 0 });
		expect(rect.scale).toMatchObject({ x: 1, y: 1, z: 1 });
		expect(rect.opacity).toBe(1);
		expect(rect.visible).toBe(true);
	});

	it("tag resolves the definition, and the definition round-trips", () => {
		for (const tag of Object.keys(S.EntityMap) as Array<S.EntityTag>) {
			expect(S.getEntityDefinitionByTag(tag)).toBe(S.EntityMap[tag]);
			expect(S.EntityMap[tag].fields._tag).toBeDefined();
		}
	});

	it("Line geometry is relative to position: translation is rigid", () => {
		// the traits spec's scenario, expressed in the new model: a line
		// spanning (50, 20, 300) keeps that span wherever it is moved
		const line = S.Line.make({
			position: S.vec3({ x: 0, y: 0, z: 0 }),
			start: S.vec3({ x: 0, y: 0, z: 0 }),
			end: S.vec3({ x: 50, y: 20, z: 300 }),
		});
		const moved = { ...line, position: S.vec3({ x: 100, y: 100, z: 100 }) };
		// endpoints are offsets, so the span is untouched by the move
		expect(moved.end.x - moved.start.x).toBe(50);
		expect(moved.end.y - moved.start.y).toBe(20);
		expect(moved.end.z - moved.start.z).toBe(300);
		// and the absolute endpoints followed the position
		expect(moved.position.x + moved.start.x).toBe(100);
		expect(moved.position.x + moved.end.x).toBe(150);
		expect(moved.position.z + moved.end.z).toBe(400);
	});

	it("Path keeps its commands when moved", () => {
		const path = S.Path.make({
			position: S.vec3({ x: 50, y: 50, z: 0 }),
			commands: [
				{ _tag: "M", x: 0, y: 0 },
				{ _tag: "L", x: 60, y: 40 },
			],
		});
		const moved = { ...path, position: S.vec3({ x: 300, y: 200, z: 0 }) };
		expect(moved.commands).toEqual(path.commands);
	});

	it("Path rejects a first command that is not M", () => {
		expect(() =>
			S.Path.make({
				commands: [{ _tag: "L", x: 0, y: 0 }],
			}),
		).toThrow();
	});

	it("restored fields survive: Text fill, Image dimensions", () => {
		expect(S.Text.make({ text: "hi" }).fillColor).toBeDefined();
		const image = S.Image.make({
			image: { _tag: "effect-motion/Resources/Image", id: "logo" },
		});
		// optional and undefaulted — absent means natural size
		expect("width" in image).toBe(false);
		expect("height" in image).toBe(false);
	});

	it("dropped fields are gone: Rect radii, Group comp bounds, Square", () => {
		expect("rx" in S.Rect.fields).toBe(false);
		expect("ry" in S.Rect.fields).toBe(false);
		expect("width" in S.Group.fields).toBe(false);
		expect("height" in S.Group.fields).toBe(false);
		expect("backgroundColor" in S.Group.fields).toBe(false);
		expect("transform" in S.Group.fields).toBe(false);
		expect("Square" in S.EntityMap).toBe(false);
	});

	it("Hud carries the full paintable set, Group's shape", () => {
		expect(Object.keys(S.Hud.fields).sort()).toEqual(
			Object.keys(S.Group.fields).sort(),
		);
	});

	it("instances carry an id and a tag, never the definition", () => {
		const instance = S.makeInstance("circle_0", "Circle");
		// _tag lives on the Pipeable prototype, so toEqual (own properties
		// only) cannot see it — assert the fields and the tag separately
		expect(instance).toMatchObject({ id: "circle_0", kind: "Circle" });
		expect(instance._tag).toBe("Instance");
		expect(typeof instance.pipe).toBe("function");
		expect(S.isInstance(instance)).toBe(true);
		expect(S.isInstanceOf("Circle", instance)).toBe(true);
		expect(S.isInstanceOf("Rect", instance)).toBe(false);
		expect(S.isInstance({ id: "x" })).toBe(false);
	});
});

describe("type-level gating", () => {
	it("TagsWith selects entities carrying a field", () => {
		// compile-time assertions: these fail the build, not the runner
		const opacityTags: ReadonlyArray<S.TagsWith<"opacity">> = [
			"Circle",
			"Rect",
			"Group",
			"Hud",
			"Text",
			"Image",
			"Line",
			"Path",
			"Ellipse",
		];
		// @ts-expect-error Camera has no opacity, so it is not a TagsWith<"opacity">
		const bad: ReadonlyArray<S.TagsWith<"opacity">> = ["Camera"];
		expect(opacityTags).toHaveLength(9);
		expect(bad).toBeDefined();
	});

	it("every entity has a position, camera included", () => {
		const positionTags: ReadonlyArray<S.TagsWith<"position">> = [
			...(Object.keys(S.EntityMap) as Array<S.EntityTag>),
		];
		expect(positionTags).toHaveLength(10);
	});

	it("an instance narrows to exactly its entity's data", () => {
		type CircleData = S.DataOf<S.Instance<"Circle">>;
		const circle: CircleData = S.Circle.make({ radius: 5 });
		expect(circle._tag).toBe("Circle");
		expect(circle.radius).toBe(5);
		// @ts-expect-error a Circle has no `text` field
		expect(circle.text).toBeUndefined();
	});
});
