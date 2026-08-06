import * as Entity from "effect-motion/Entity";
import { describe, expect, it } from "vitest";
import * as Entities from "../src/Entities";

describe("catalog", () => {
	it("covers the closed entity world exactly", () => {
		expect([...Entities.entities].map((entity) => entity.tag).sort()).toEqual(
			Object.keys(Entity.EntityMap).sort(),
		);
	});

	it("marks the containers the engine treats as containers", () => {
		const containers = Entities.entities
			.filter((entity) => entity.container)
			.map((entity) => entity.tag)
			.sort();
		expect(containers).toEqual(["Group", "Hud"]);
	});

	it("marks the camera as the one entity that does not paint", () => {
		const unpainted = Entities.entities
			.filter((entity) => !entity.paintable)
			.map((entity) => entity.tag);
		expect(unpainted).toEqual(["Camera"]);
	});

	it("names only fields the entity's schema actually has", () => {
		for (const entity of Entities.entities) {
			const definition = Entity.getEntityDefinitionByTag(
				entity.tag as Entity.EntityTag,
			);
			const fields = Object.keys(definition.fields);
			for (const field of entity.fields)
				expect(fields, `${entity.tag}.${field}`).toContain(field);
		}
	});

	it("recognises tags and rejects everything else", () => {
		expect(Entities.isEntityTag("Circle")).toBe(true);
		expect(Entities.isEntityTag("Squircle")).toBe(false);
	});
});
