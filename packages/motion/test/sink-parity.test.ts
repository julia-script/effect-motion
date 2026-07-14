// @vitest-environment happy-dom
import { Effect, Layer } from "effect";
import * as Stream from "effect/Stream";
import { expect, it } from "vitest";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

// one frame exercising every entry in the built-in coverage manifest
const allShapesScene = Scene.make(function* () {
	yield* Scene.instantiate(Shapes.Circle, { x: 10, y: 20, radius: 5, fill: "#111", opacity: 0.5 });
	yield* Scene.instantiate(Shapes.Rect, { x: 1, y: 2, width: 30, height: 40, stroke: "#222", strokeWidth: 2 });
	yield* Scene.instantiate(Shapes.Square, { x: 3, y: 4, size: 25, fill: "#333" });
	yield* Scene.instantiate(Shapes.Ellipse, { x: 50, y: 60, rx: 7, ry: 8, fill: "#444" });
	yield* Scene.instantiate(Shapes.Line, { x: 0, y: 0, x2: 100, y2: 100, stroke: "#555" });
	yield* Scene.instantiate(Shapes.Path, { x: 5, y: 6, d: "M 0 0 L 10 10", fill: "#666" });
	yield* Scene.instantiate(Shapes.Group, {
		x: 70,
		y: 80,
		opacity: 0.9,
		children: [
			Scene.instantiate(Shapes.Circle, { x: 1, y: 1, radius: 2, fill: "#777" }),
		],
	});
	yield* Scene.instantiate(
		Shapes.Text,
		{ text: "hello & <world>", x: 9, y: 9, fontSize: 12, textAnchor: "middle", baseline: "hanging", fill: "#888" },
	);
	// a hidden shape: both sinks must skip it identically
	yield* Scene.instantiate(Shapes.Square, { x: 5, y: 5, size: 8, fill: "#000", $visible: false });
	yield* Scene.tick;
});

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

// canonical view of an element: tag, namespace, sorted attributes, direct
// text, children. xmlns is compared as namespaceURI, not as an attribute —
// the string sink must write it, the DOM sink gets it from createElementNS.
const canonical = (el: Element): unknown => ({
	tag: el.tagName.toLowerCase(),
	ns: el.namespaceURI,
	attrs: Object.fromEntries(
		[...el.attributes]
			.filter((a) => a.name !== "xmlns")
			.sort((a, b) => a.name.localeCompare(b.name))
			.map((a) => [a.name, a.value]),
	),
	text: [...el.childNodes]
		.filter((n) => n.nodeType === 3)
		.map((n) => n.textContent)
		.join(""),
	children: [...el.children].map(canonical),
});

it("string and DOM sinks agree on the full built-in shape surface", async () => {
	const target = document.createElement("div");
	const svgString = await Effect.runPromise(
		Effect.gen(function* () {
			const head = yield* Scene.stream(allShapesScene).pipe(Stream.runHead);
			if (head._tag !== "Some") throw new Error("no frames");
			const frame = head.value as Scene.Frame<
				| typeof Shapes.Circle
				| typeof Shapes.Rect
				| typeof Shapes.Square
				| typeof Shapes.Ellipse
				| typeof Shapes.Line
				| typeof Shapes.Path
				| typeof Shapes.Group
				| typeof Shapes.Text
			>;
			const domRenderer = yield* Svg.SvgDomRenderer.Context;
			yield* domRenderer.render(frame, { target });
			const stringRenderer = yield* Svg.SvgRenderer.Context;
			return yield* stringRenderer.render(frame, {});
		}).pipe(Effect.provide(layers)),
	);

	const parsed = new DOMParser().parseFromString(svgString, "image/svg+xml").documentElement;
	const materialized = target.querySelector("svg");
	expect(materialized).not.toBeNull();

	// parity covers frame metadata: both roots carry width/height + background rect
	expect(materialized?.getAttribute("width")).toBe("500");
	expect(parsed.getAttribute("width")).toBe("500");

	// biome-ignore lint/style/noNonNullAssertion: asserted above
	expect(canonical(parsed)).toEqual(canonical(materialized!));

	// the frame actually contains the whole surface
	const tags = [...parsed.querySelectorAll("*")].map((e) => e.tagName.toLowerCase());
	for (const tag of ["circle", "rect", "ellipse", "line", "path", "g", "text"]) {
		expect(tags).toContain(tag);
	}
	// the hidden square is skipped by BOTH sinks (parity already asserted
	// above): 3 <rect>s — background + Rect + visible Square — not 4. The
	// hidden Square (also a <rect>) is absent.
	expect(tags.filter((t) => t === "rect")).toHaveLength(3);
});
