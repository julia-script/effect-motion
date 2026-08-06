import { describe, expect, it } from "vitest";
import * as Docs from "../src/Docs";
import * as Easings from "../src/Easings";
import * as Entities from "../src/Entities";
import * as Springs from "../src/Springs";

describe("easing markdown", () => {
	it("leads with an inline curve and names the family", () => {
		const md = Docs.easing("easeOutBack") ?? "";
		expect(
			md.startsWith("![easeOutBack curve](data:image/svg+xml;base64,"),
		).toBe(true);
		expect(md).toContain("**easeOutBack**");
		expect(md).toContain("Back");
	});

	// the image url must contain nothing markdown can misread: a space would
	// end the url and turn the whole preview into alt text
	it("embeds a url markdown cannot break", () => {
		for (const easing of Easings.easings) {
			const url = /^!\[[^\]]*\]\(([^)]*)\)/.exec(
				Docs.easing(easing.name) ?? "",
			);
			expect(url?.[1], easing.name).toBeTypeOf("string");
			expect(url?.[1] ?? "", easing.name).not.toMatch(/[\s"'()]/);
		}
	});

	it("says which curves land on target and which do not", () => {
		expect(Docs.easing("easeOutCubic")).toContain("lands exactly on target");
		expect(Docs.easing("easeOutBack")).toContain("overshoot is the effect");
		expect(Docs.easing("sin")).toContain("RETURNS to its starting value");
	});

	it("gives nothing back for a name that is not an easing", () => {
		expect(Docs.easing("easeOutSideways")).toBeUndefined();
	});

	it("documents every catalogued easing", () => {
		for (const easing of Easings.easings)
			expect(Docs.easing(easing.name), easing.name).toBeTypeOf("string");
	});
});

describe("spring markdown", () => {
	it("reports the physical parameters and the length they produce", () => {
		const md = Docs.spring("plop", { frameRate: 60 }) ?? "";
		expect(md).toContain("mass 0.2");
		expect(md).toContain("stiffness 20");
		expect(md).toContain("frames");
		expect(md).toContain("60 fps");
	});

	it("follows the frame rate it is given", () => {
		expect(Docs.spring("smooth", { frameRate: 24 })).toContain("24 fps");
	});

	it("documents every preset", () => {
		for (const preset of Springs.presets)
			expect(Docs.spring(preset.name), preset.name).toBeTypeOf("string");
	});
});

describe("duration markdown", () => {
	it("reports frames at the given rate", () => {
		expect(Docs.duration("400 millis", 60)).toContain("**24 frames**");
	});

	it("flags a duration that does not land on a frame", () => {
		expect(Docs.duration("10 millis", 60)).toContain("rounded");
	});

	it("gives nothing back for a string that is not a duration", () => {
		expect(Docs.duration("soon", 60)).toBeUndefined();
	});
});

describe("entity markdown", () => {
	it("separates an entity's own fields from the shared ones", () => {
		const md = Docs.entity("Circle") ?? "";
		expect(md).toContain("`radius`");
		expect(md).toContain("`opacity`");
	});

	it("omits appearance fields from the camera, which does not paint", () => {
		expect(Docs.entity("Camera")).not.toContain("`opacity`");
	});

	it("documents every entity", () => {
		for (const entity of Entities.entities)
			expect(Docs.entity(entity.tag), entity.tag).toBeTypeOf("string");
	});
});

describe("the gallery page", () => {
	const html = Docs.gallery();

	// a webview with no network: every curve is inline SVG, every style and
	// script is inline, and the only http:// in the page is the SVG namespace
	it("loads nothing from the network", () => {
		expect(html.startsWith("<!doctype html>")).toBe(true);
		expect(html).not.toMatch(/<script[^>]+src=/);
		expect(html).not.toMatch(/<link/);
		expect(html).not.toMatch(/(?:src|href)="https?:/);
	});

	it("shows every easing and every spring preset", () => {
		for (const easing of Easings.easings)
			expect(html, easing.name).toContain(`>${easing.name}<`);
		for (const preset of Springs.presets)
			expect(html, preset.name).toContain(`>${preset.name}<`);
	});

	it("carries an insert payload on every card", () => {
		const cards = html.match(/data-insert="/g) ?? [];
		expect(cards).toHaveLength(Easings.easings.length + Springs.presets.length);
	});

	it("follows the theme it is given", () => {
		expect(Docs.gallery("light")).toContain("color-scheme: light");
		expect(Docs.gallery("dark")).toContain("color-scheme: dark");
	});
});
