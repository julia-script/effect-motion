import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import * as Entity from "../src/Entity";

describe("Entity.make reserved $ namespace", () => {
	it("rejects a field with a $ prefix, naming it", () => {
		expect(() =>
			Entity.make("test/Bad", { $visible: Schema.Boolean }),
		).toThrow(/\$visible/);
	});

	it("rejects an arbitrary $-prefixed field", () => {
		expect(() => Entity.make("test/Bad", { $foo: Schema.String })).toThrow(
			/reserved/,
		);
	});

	it("accepts ordinary fields", () => {
		const e = Entity.make("test/Ok", { a: Schema.String, b: Schema.Number });
		expect(e.name).toBe("test/Ok");
	});
});
