import { readFileSync } from "node:fs";
import * as Entity from "effect-motion/Entity";
import * as Physics from "effect-motion/Physics";
import * as Timing from "effect-motion/Timing";
import { describe, expect, it } from "vitest";
import * as Assets from "../src/Assets";
import * as Entities from "../src/Entities";
import { unreachable } from "./support/raise";

interface Rule {
	readonly match?: string;
	readonly captures?: Record<string, { name?: string }>;
	readonly comment?: string;
}

interface Grammar {
	readonly scopeName: string;
	readonly injectionSelector: string;
	readonly patterns: ReadonlyArray<{ include: string }>;
	readonly repository: Record<string, Rule>;
}

const grammar = JSON.parse(
	readFileSync(Assets.grammarPath(), "utf8"),
) as Grammar;

const snippets = JSON.parse(
	readFileSync(Assets.snippetsPath(), "utf8"),
) as Record<
	string,
	{ prefix: string; body: ReadonlyArray<string>; description: string }
>;

/** The alternation inside a rule's second capture group. */
const alternation = (rule: string): ReadonlyArray<string> => {
	const pattern = grammar.repository[rule]?.match ?? unreachable();
	const group = /\(([^()]*\|[^()]*)\)/.exec(pattern)?.[1] ?? unreachable();
	return group.split("|");
};

describe("the injection grammar", () => {
	it("is registered under the scope Assets advertises", () => {
		expect(grammar.scopeName).toBe(Assets.grammarScope);
	});

	// L: means the injection runs before the base grammar, which is the only
	// way to re-scope a string the TypeScript grammar would otherwise own
	it("injects ahead of the TypeScript grammar, outside comments and strings", () => {
		expect(grammar.injectionSelector).toContain("L:source.ts");
		expect(grammar.injectionSelector).toContain("-comment");
		expect(grammar.injectionSelector).toContain("-string");
	});

	it("every pattern it includes exists in the repository", () => {
		for (const { include } of grammar.patterns)
			expect(grammar.repository).toHaveProperty(include.slice(1));
	});

	it("every rule compiles as a regular expression", () => {
		for (const [name, rule] of Object.entries(grammar.repository))
			expect(() => new RegExp(rule.match ?? ""), name).not.toThrow();
	});

	it("every capture carries a scope name", () => {
		for (const [name, rule] of Object.entries(grammar.repository))
			for (const [index, capture] of Object.entries(rule.captures ?? {}))
				expect(capture.name, `${name}[${index}]`).toBeTypeOf("string");
	});

	it("lists every easing the library accepts", () => {
		expect([...alternation("easing-names")].sort()).toEqual(
			Object.keys(Timing.timingFunctions).sort(),
		);
	});

	it("lists every spring preset", () => {
		expect([...alternation("spring-names")].sort()).toEqual(
			Object.keys(Physics.springs).sort(),
		);
	});

	it("lists every entity tag", () => {
		expect([...alternation("entity-tags")].sort()).toEqual(
			Object.keys(Entity.EntityMap).sort(),
		);
	});

	// longest-first matters in an alternation: `easeIn` would otherwise win
	// over `easeInOutCubic` and leave `OutCubic` unscoped
	it("orders easing alternatives so no prefix shadows a longer name", () => {
		const names = alternation("easing-names");
		for (const [index, name] of names.entries())
			for (const later of names.slice(index + 1))
				expect(later.startsWith(name), `${name} shadows ${later}`).toBe(false);
	});

	it("scopes the strings a scene is actually written with", () => {
		const easing = new RegExp(
			grammar.repository["easing-names"]?.match ?? unreachable(),
		);
		expect(easing.test(`"easeInOutCubic")`)).toBe(true);
		expect(easing.test(`"easeInOutCubic",`)).toBe(true);
		// not an argument, so not an easing
		expect(easing.test(`const mode = "linear";`)).toBe(false);
	});

	it("scopes duration strings by value and unit", () => {
		const durations = new RegExp(
			grammar.repository.durations?.match ?? unreachable(),
		);
		expect(durations.test(`"1 second"`)).toBe(true);
		expect(durations.test(`"400 millis"`)).toBe(true);
		expect(durations.test(`"soon"`)).toBe(false);
	});
});

describe("the snippets", () => {
	it("gives every snippet a unique prefix, a body, and a description", () => {
		const prefixes = Object.values(snippets).map((snippet) => snippet.prefix);
		expect(new Set(prefixes).size).toBe(prefixes.length);
		for (const [name, snippet] of Object.entries(snippets)) {
			expect(snippet.prefix, name).toMatch(/^em/);
			expect(snippet.body.length, name).toBeGreaterThan(0);
			expect(snippet.description, name).toBeTruthy();
		}
	});

	it("offers only entity tags the engine knows", () => {
		const choices = JSON.stringify(snippets).matchAll(
			/\$\{\d+\|([A-Za-z,]+)\|\}/g,
		);
		for (const [, group] of choices) {
			const options = (group ?? "").split(",");
			// choice lists are either entity tags or spring presets or anchors
			if (!Entities.isEntityTag(options[0] ?? "")) continue;
			for (const option of options)
				expect(Entities.isEntityTag(option), option).toBe(true);
		}
	});

	it("names easings and springs the library actually has", () => {
		const body = JSON.stringify(snippets);
		for (const [, name] of body.matchAll(/\\"(ease[A-Za-z]+)\\"/g))
			expect(Object.keys(Timing.timingFunctions)).toContain(name);
	});
});

describe("the catalog", () => {
	it("carries every easing, spring, and entity", () => {
		const catalog = Assets.catalog();
		expect(catalog.easings).toHaveLength(
			Object.keys(Timing.timingFunctions).length,
		);
		expect(catalog.springs).toHaveLength(Object.keys(Physics.springs).length);
		expect(catalog.entities).toHaveLength(Object.keys(Entity.EntityMap).length);
	});

	it("survives a JSON round trip, so other editors can consume it", () => {
		expect(JSON.parse(JSON.stringify(Assets.catalog()))).toEqual(
			JSON.parse(JSON.stringify(Assets.catalog())),
		);
	});
});
