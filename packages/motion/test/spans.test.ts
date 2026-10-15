import * as SchemaIssue from "effect/SchemaIssue";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as Entity from "../src/Entity";

const blue = Color.hex("#3b82f6");
const green = Color.hex("#22c55e");
const formatIssue = SchemaIssue.makeFormatterDefault();

const expectSpanIssue = (make: () => unknown, message: RegExp) => {
	let error: unknown;
	try {
		make();
	} catch (cause) {
		error = cause;
	}
	expect(error).toBeInstanceOf(Error);
	const cause = error instanceof Error ? error.cause : undefined;
	expect(SchemaIssue.isIssue(cause) ? formatIssue(cause) : undefined).toMatch(
		message,
	);
};

describe("Text spans", () => {
	it("a span-less Text is unchanged", () => {
		const text = Entity.Text.make({ text: "hi" });
		expect("spans" in text).toBe(false);
		expect(text.fillColor).toBeDefined();
	});

	it("valid spans are stored with their colors", () => {
		const text = Entity.Text.make({
			text: "const x",
			spans: [
				Entity.Span.make({ from: 0, to: 5, fillColor: blue }),
				Entity.Span.make({ from: 6, to: 7, fillColor: green }),
			],
		});
		expect(text.spans).toHaveLength(2);
		expect(text.spans?.[0]).toMatchObject({ from: 0, to: 5 });
		expect(text.spans?.[1]).toMatchObject({ from: 6, to: 7 });
	});

	it("adjacent spans are valid (to is exclusive)", () => {
		const text = Entity.Text.make({
			text: "abcd",
			spans: [
				Entity.Span.make({ from: 0, to: 2, fillColor: blue }),
				Entity.Span.make({ from: 2, to: 4, fillColor: green }),
			],
		});
		expect(text.spans).toHaveLength(2);
	});

	it("an empty span is rejected", () => {
		expectSpanIssue(
			() =>
				Entity.Text.make({
					text: "abcd",
					spans: [Entity.Span.make({ from: 2, to: 2, fillColor: blue })],
				}),
			/non-empty/,
		);
	});

	it("overlapping spans are rejected", () => {
		expectSpanIssue(
			() =>
				Entity.Text.make({
					text: "abcd",
					spans: [
						Entity.Span.make({ from: 0, to: 3, fillColor: blue }),
						Entity.Span.make({ from: 2, to: 4, fillColor: green }),
					],
				}),
			/ascending and non-overlapping/,
		);
	});

	it("out-of-order spans are rejected", () => {
		expectSpanIssue(
			() =>
				Entity.Text.make({
					text: "abcd",
					spans: [
						Entity.Span.make({ from: 2, to: 4, fillColor: blue }),
						Entity.Span.make({ from: 0, to: 2, fillColor: green }),
					],
				}),
			/ascending and non-overlapping/,
		);
	});

	it("an out-of-bounds span is rejected", () => {
		expectSpanIssue(
			() =>
				Entity.Text.make({
					text: "abcd",
					spans: [Entity.Span.make({ from: 0, to: 5, fillColor: blue })],
				}),
			/past the end/,
		);
	});

	it("non-integer indices are rejected", () => {
		expectSpanIssue(
			() =>
				Entity.Text.make({
					text: "abcd",
					spans: [Entity.Span.make({ from: 0.5, to: 2, fillColor: blue })],
				}),
			/integers/,
		);
	});
});
