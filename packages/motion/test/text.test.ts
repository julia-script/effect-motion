// @vitest-environment happy-dom
import { Effect, Layer } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Motion from "../src/Motion";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

const richContent = {
	type: "root",
	children: [
		{
			type: "paragraph",
			children: [
				{ type: "text", value: "plain < " },
				{
					type: "strong",
					children: [{ type: "text", value: "bold &" }],
				},
				{ type: "text", value: "\n" },
			],
		},
		{
			type: "paragraph",
			children: [
				{
					type: "emphasis",
					children: [
						{ type: "text", value: "italic " },
						{
							type: "strong",
							children: [{ type: "text", value: "both" }],
						},
					],
				},
			],
		},
	],
} satisfies Shapes.TextContent;

const renderText = (data: (typeof Shapes.Text)["data"]["Type"]) =>
	Effect.runPromise(
		Svg.shapes.text({
			entity: Shapes.Text,
			id: "t",
			data,
			children: [],
		}) as Effect.Effect<any, never, never>,
	);

describe("Shapes.Text schema", () => {
	it("defaults are visible and deterministic", () => {
		const data = Shapes.Text.data.make({ text: "hi" });
		expect(data).toMatchObject({
			text: "hi",
			x: 0,
			y: 0,
			fill: "black",
			opacity: 1,
			fontSize: 16,
			fontFamily: "sans-serif",
		});
		expect("textAnchor" in data).toBe(false);
		expect("baseline" in data).toBe(false);
	});

	it("text is required", () => {
		expect(() => Shapes.Text.data.make({} as never)).toThrow();
	});

	it("accepts and retains multiple rich paragraphs", () => {
		expect(Shapes.Text.data.make({ text: richContent }).text).toEqual(
			richContent,
		);
	});

	it.each([
		[
			"heading",
			{ type: "root", children: [{ type: "heading", children: [] }] },
		],
		[
			"link",
			{
				type: "root",
				children: [
					{ type: "paragraph", children: [{ type: "link", children: [] }] },
				],
			},
		],
		[
			"inlineCode",
			{
				type: "root",
				children: [
					{
						type: "paragraph",
						children: [{ type: "inlineCode", value: "code" }],
					},
				],
			},
		],
	] as const)("rejects unsupported %s nodes", (_type, text) => {
		expect(() => Shapes.Text.data.make({ text } as never)).toThrow();
	});
});

describe("Text SVG rendering", () => {
	it("maps props and carries content, escaped by the string sink", async () => {
		const node = await renderText(
			Shapes.Text.data.make({ text: "a < b & c", x: 5, y: 6, fill: "red" }),
		);
		expect(node).toMatchObject({
			tag: "text",
			props: {
				x: 5,
				y: 6,
				"font-size": 16,
				"font-family": "sans-serif",
				fill: "red",
			},
			children: "a < b & c",
		});
		expect(Svg.vnodeToString(node)).toContain(">a &lt; b &amp; c</text>");
	});

	it("renders multiple paragraphs with escaped and nested marks", async () => {
		const node = await renderText(Shapes.Text.data.make({ text: richContent }));
		const svg = Svg.vnodeToString(node);

		expect(node.children).toHaveLength(2);
		expect(svg).toContain("<tspan><tspan>plain &lt; </tspan>");
		expect(svg).toContain("<tspan>\n</tspan>");
		expect(svg).toContain(
			'<tspan font-weight="bold"><tspan>bold &amp;</tspan></tspan>',
		);
		expect(svg).toContain(
			'<tspan font-style="italic"><tspan>italic </tspan><tspan font-weight="bold"><tspan>both</tspan></tspan></tspan>',
		);
	});

	it("omits alignment attributes when unset", async () => {
		const node = await renderText(Shapes.Text.data.make({ text: "hi" }));
		expect("text-anchor" in node.props).toBe(false);
		expect("dominant-baseline" in node.props).toBe(false);
	});

	it("centered text carries both alignment attributes", async () => {
		const node = await renderText(
			Shapes.Text.data.make({
				text: "hi",
				textAnchor: "middle",
				baseline: "middle",
			}),
		);
		expect(node.props["text-anchor"]).toBe("middle");
		expect(node.props["dominant-baseline"]).toBe("middle");
	});
});

describe("Text SVG DOM rendering", () => {
	it("materializes rich content as nested tspan elements", async () => {
		const target = document.createElement("div");
		const frame: Scene.Frame<typeof Shapes.Group | typeof Shapes.Text> = {
			instances: {
				t: {
					data: Shapes.Text.data.make({ text: richContent }),
					entity: Shapes.Text,
				},
				root: {
					data: Shapes.Group.data.make({ children: ["t"] }),
					entity: Shapes.Group,
				},
			},
			root: "root",
			frameRate: 60,
			width: 500,
			height: 300,
			backgroundColor: "#16161d",
		};

		await Effect.runPromise(
			Effect.gen(function* () {
				const renderer = yield* Svg.SvgDomRenderer.Context;
				yield* renderer.render(frame, { target, width: 500, height: 300 });
			}).pipe(
				Effect.provide(Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer))),
			),
		);

		const text = target.querySelector("text");
		const italic = text?.querySelector('tspan[font-style="italic"]');
		expect(text?.children).toHaveLength(2);
		expect(text?.querySelectorAll("tspan")).toHaveLength(10);
		expect(text?.textContent).toBe("plain < bold &\nitalic both");
		expect(text?.querySelector('tspan[font-weight="bold"]')).not.toBeNull();
		expect(italic?.querySelector('tspan[font-weight="bold"]')).not.toBeNull();
	});
});

// runs a scene and tracks the first non-root instance's data per frame
const track = async (
	make: () => Generator<Effect.Effect<any, any, any>, void, never>,
): Promise<Array<Record<string, any>>> => {
	const scene = Scene.make(make as never);
	const frames = await Effect.runPromise(
		Scene.stream(scene as never).pipe(
			Stream.runCollect,
		) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
	);
	return [...frames].map(
		(frame) =>
			Object.entries(frame.instances).find(([id]) => id !== frame.root)![1]
				.data as Record<string, any>,
	);
};

describe("Text motion", () => {
	it("moves and fades via the standard traits", async () => {
		const frames = await track(function* () {
			const title = yield* Scene.instantiate(Shapes.Text, {
				text: "hi",
				x: 0,
				opacity: 1,
			});
			yield* title.pipe(
				Motion.moveTo({ x: 100 }, "0.5 seconds"),
				Motion.fadeTo(0, "0.5 seconds"),
			);
		});
		expect(frames[29]!.x).toBe(100);
		expect(frames.at(-1)!.opacity).toBe(0);
		expect(frames.at(-1)!.text).toBe("hi"); // content untouched by motion
	});

	it("fontSize is tweenable", async () => {
		const frames = await track(function* () {
			const title = yield* Scene.instantiate(Shapes.Text, {
				text: "hi",
				fontSize: 8,
			});
			yield* Motion.tweenTo(title, { fontSize: 48 }, "0.5 seconds");
		});
		expect(frames[0]!.fontSize).toBeGreaterThan(8);
		expect(frames[14]!.fontSize).toBe(28); // linear midpoint
		expect(frames[29]!.fontSize).toBe(48);
	});
});
