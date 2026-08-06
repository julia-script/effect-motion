import { describe, expect, it } from "vitest";
import * as CallContext from "../src/CallContext";

/** `|` marks the cursor. */
const at = (marked: string) => {
	const offset = marked.indexOf("|");
	return {
		source: marked.replace("|", ""),
		offset,
	};
};

const suggestion = (marked: string) => {
	const { source, offset } = at(marked);
	return CallContext.suggestionAt(source, offset);
};

const context = (marked: string) => {
	const { source, offset } = at(marked);
	return CallContext.at(source, offset);
};

describe("suggestions", () => {
	it("offers easings after a duration argument", () => {
		expect(suggestion(`Motion.moveTo(dot, { x: 1 }, "1 second", "|")`)).toBe(
			"easing",
		);
	});

	it("offers durations before one has been written", () => {
		expect(suggestion(`Motion.moveTo(dot, { x: 1 }, "|")`)).toBe("duration");
	});

	// the dual call forms differ in arity, so the rule cannot be an index
	it("reads both call forms the same way", () => {
		expect(suggestion(`Motion.fadeTo(dot, 0, "400 millis", "|")`)).toBe(
			"easing",
		);
		expect(suggestion(`dot.pipe(Motion.fadeTo(0, "400 millis", "|"))`)).toBe(
			"easing",
		);
	});

	it("offers spring presets to the spring animators", () => {
		expect(suggestion(`Physics.springTo(dot, { x: 180 }, "|")`)).toBe("spring");
		expect(
			suggestion(`dot.pipe(Physics.spring({ x: 1 }, { x: 2 }, "|"))`),
		).toBe("spring");
	});

	it("offers entity tags to instantiate's first argument only", () => {
		expect(suggestion(`Scene.instantiate("|", {})`)).toBe("entity");
		expect(suggestion(`Scene.instantiate("Circle", { text: "|" })`)).toBe(
			undefined,
		);
	});

	it("offers durations to wait and sleep", () => {
		expect(suggestion(`Motion.wait("|")`)).toBe("duration");
		expect(suggestion(`Scene.sleep("|")`)).toBe("duration");
	});

	it("says nothing outside a string literal", () => {
		expect(suggestion(`Motion.moveTo(dot, { x: | })`)).toBe(undefined);
	});

	it("says nothing in an unrelated call", () => {
		expect(suggestion(`console.log("|")`)).toBe(undefined);
	});

	it("looks at the innermost call, not the outermost", () => {
		expect(
			suggestion(`Scene.all([Motion.moveTo(dot, {}, "1 second", "|")])`),
		).toBe("easing");
	});

	it("survives a multi-line argument list", () => {
		expect(
			suggestion(
				[
					"yield* Motion.moveTo(",
					"\tdot,",
					"\t{ x: 430 },",
					'\t"1 second",',
					'\t"|",',
					");",
				].join("\n"),
			),
		).toBe("easing");
	});

	it("is not fooled by a duration in an earlier, closed call", () => {
		expect(
			suggestion(`Motion.wait("1 second"); Motion.moveTo(dot, {}, "|")`),
		).toBe("duration");
	});
});

describe("context", () => {
	it("reports the callee and the argument index", () => {
		const found = context(`Scene.instantiate("Circle", |{})`);
		expect(found?.callee).toBe("Scene.instantiate");
		expect(found?.argIndex).toBe(1);
	});

	// an object literal is its own frame, so a property value is not an
	// argument of the enclosing call — which is what stops instantiate's
	// entity completions from firing inside its props
	it("treats an object literal as its own scope", () => {
		expect(
			context(`Scene.instantiate("Circle", { radius: 1|2 })`)?.callee,
		).toBe("");
	});

	it("reports the literal the cursor sits in", () => {
		const found = context(`Motion.wait("400 mi|llis")`);
		expect(found?.literal?.text).toBe("400 millis");
	});

	it("ignores brackets and quotes inside comments", () => {
		const found = context(
			['// a stray ( and a " quote', 'Motion.wait("|")'].join("\n"),
		);
		expect(found?.callee).toBe("Motion.wait");
	});

	it("gives nothing back inside a comment", () => {
		expect(context(`Motion.wait("1 second"); // here |`)).toBe(undefined);
	});

	it("gives nothing back at the top level", () => {
		expect(context(`const x = 1|;`)).toBe(undefined);
	});
});
