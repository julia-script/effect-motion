import * as Schema from "effect/Schema";
import { describe, expect, it } from "vitest";
import * as Entity from "../src/Entity";

describe("Entity.make builtin ~visible", () => {
	it("adds ~visible to the data schema, defaulting true", () => {
		const e = Entity.make("test/Ok", { a: Schema.String });
		expect(e.data.make({ a: "x" })["~visible"]).toBe(true);
	});

	it("an explicit ~visible false is kept", () => {
		const e = Entity.make("test/Ok", { a: Schema.String });
		expect(e.data.make({ a: "x", "~visible": false })["~visible"]).toBe(false);
	});

	it("accepts ordinary fields", () => {
		const e = Entity.make("test/Ok", { a: Schema.String, b: Schema.Number });
		expect(e.name).toBe("test/Ok");
	});
});
