// @vitest-environment happy-dom
import { Effect, Exit, Layer } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import * as Shapes from "../src/shapes";
import * as Svg from "../src/svg";

type Entities = typeof Shapes.Group | typeof Shapes.Circle;

const layers = Svg.layer.pipe(Layer.provideMerge(Svg.shapesLayer));

const frameOf = (
	instances: Scene.Frame<Entities>["instances"],
	rootChildren: ReadonlyArray<string>,
): Scene.Frame<Entities> => ({
	instances: {
		...instances,
		root: {
			data: Shapes.Group.data.make({ children: rootChildren }),
			entity: Shapes.Group,
		},
	},
	root: "root",
	frameRate: 60,
	width: 500,
	height: 300,
	backgroundColor: "#16161d",
	camera: { x: 0, y: 0, zoom: 1 },
});

const renderString = (frame: Scene.Frame<Entities>) =>
	Effect.gen(function* () {
		const renderer = yield* Svg.SvgRenderer.Context;
		return yield* renderer.render(frame, { width: 500, height: 300 });
	}).pipe(Effect.provide(layers));

const circleAt = (x: number) => ({
	data: Shapes.Circle.data.make({ x }),
	entity: Shapes.Circle,
});

describe("group rendering", () => {
	it("normalizes transforms to a matrix through both sinks", async () => {
		const groupData = Shapes.Group.make({
			x: 100,
			y: 50,
			transform: [
				{ _tag: "transform/translate", x: 1, y: 2 },
				{ _tag: "transform/scale", x: 2, y: 3 },
			],
			opacity: 0.5,
			children: ["c1"],
		});
		const frame = frameOf(
			{
				g1: {
					data: groupData,
					entity: Shapes.Group,
				},
				c1: circleAt(10),
			},
			["g1"],
		);

		const svg = await Effect.runPromise(renderString(frame));
		expect(svg).toContain(
			'<g transform="matrix(2 0 0 3 101 52)" opacity="0.5"><circle cx="10"',
		);
		expect(groupData.transform).toEqual({
			a: 2,
			b: 0,
			c: 0,
			d: 3,
			e: 1,
			f: 2,
		});

		const target = document.createElement("div");
		await Effect.runPromise(
			Effect.gen(function* () {
				const renderer = yield* Svg.SvgDomRenderer.Context;
				yield* renderer.render(frame, { target, width: 500, height: 300 });
			}).pipe(Effect.provide(layers)),
		);
		const g = target.querySelector("g");
		expect(g?.getAttribute("transform")).toBe("matrix(2 0 0 3 101 52)");
		// child coordinates stay local — position comes from the transform
		expect(g?.querySelector("circle")?.getAttribute("cx")).toBe("10");
	});

	it("nested groups nest g elements", async () => {
		const frame = frameOf(
			{
				outer: {
					data: Shapes.Group.data.make({ x: 10, children: ["inner"] }),
					entity: Shapes.Group,
				},
				inner: {
					data: Shapes.Group.data.make({ x: 20, children: ["c1"] }),
					entity: Shapes.Group,
				},
				c1: circleAt(5),
			},
			["outer"],
		);
		const svg = await Effect.runPromise(renderString(frame));
		expect(svg).toContain(
			'<g transform="matrix(1 0 0 1 10 0)"><g transform="matrix(1 0 0 1 20 0)"><circle cx="5"',
		);
	});

	it("the root group itself does not render", async () => {
		const frame = frameOf({ c1: circleAt(1) }, ["c1"]);
		const svg = await Effect.runPromise(renderString(frame));
		expect(svg).not.toContain("<g");
	});
});

describe("traversal defects", () => {
	const dies = async (frame: Scene.Frame<Entities>) => {
		const exit = await Effect.runPromiseExit(renderString(frame));
		expect(Exit.isFailure(exit)).toBe(true);
		// JSON.stringify drops Error internals; surface defect messages
		return JSON.stringify(exit, (_key, value) =>
			value instanceof Error ? value.message : value,
		);
	};

	it("duplicate reference dies naming the id", async () => {
		const frame = frameOf(
			{
				g1: {
					data: Shapes.Group.data.make({ children: ["c1"] }),
					entity: Shapes.Group,
				},
				g2: {
					data: Shapes.Group.data.make({ children: ["c1"] }),
					entity: Shapes.Group,
				},
				c1: circleAt(0),
			},
			["g1", "g2"],
		);
		expect(await dies(frame)).toContain(
			'\\"c1\\" is referenced more than once',
		);
	});

	it("cycle dies as a duplicate reference", async () => {
		const frame = frameOf(
			{
				g1: {
					data: Shapes.Group.data.make({ children: ["g2"] }),
					entity: Shapes.Group,
				},
				g2: {
					data: Shapes.Group.data.make({ children: ["g1"] }),
					entity: Shapes.Group,
				},
			},
			["g1"],
		);
		expect(await dies(frame)).toContain("referenced more than once");
	});

	it("dangling reference dies naming the id", async () => {
		const frame = frameOf(
			{
				g1: {
					data: Shapes.Group.data.make({ children: ["ghost"] }),
					entity: Shapes.Group,
				},
			},
			["g1"],
		);
		expect(await dies(frame)).toContain('unknown instance id \\"ghost\\"');
	});
});

describe("scene attachment", () => {
	const collectFrames = async (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	) => {
		const scene = Scene.make(make as never);
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
		);
		return [...frames];
	};

	it("instances attach to the root by default", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 5 });
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		const root = frame.instances[frame.root]!.data as {
			children: ReadonlyArray<string>;
		};
		expect(root.children).toHaveLength(1);
		expect(frame.instances[root.children[0]!]!.entity.name).toBe(
			"shapes/Circle",
		);
	});

	it("structure is defined by children", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate(Shapes.Group, {
				x: 100,
				transform: [{ _tag: "transform/scale", x: 2, y: 3 }],
				children: [Scene.instantiate(Shapes.Circle, { x: 5 })],
			});
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		const root = frame.instances[frame.root]!.data as {
			children: ReadonlyArray<string>;
		};
		expect(root.children).toHaveLength(1); // only the group at top level
		const group = frame.instances[root.children[0]!]!
			.data as typeof Shapes.Group.data.Type;
		expect(group.children).toHaveLength(1);
		expect(group.transform).toMatchObject({ a: 2, d: 3 });
	});

	it("appendChild reparents a lazily-created instance", async () => {
		const frames = await collectFrames(function* () {
			const group = yield* Scene.instantiate(Shapes.Group, { x: 100 });
			const circle = yield* Scene.instantiate(Shapes.Circle, { x: 5 });
			yield* Scene.appendChild(group, circle);
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		const root = frame.instances[frame.root]!.data as {
			children: ReadonlyArray<string>;
		};
		expect(root.children).toHaveLength(1); // circle moved out of root
		const group = frame.instances[root.children[0]!]!.data as {
			children: ReadonlyArray<string>;
		};
		expect(group.children).toHaveLength(1);
	});

	it("destroy detaches from the referencing group", async () => {
		const frames = await collectFrames(function* () {
			const runner = yield* Runner.Runner;
			const circle = yield* Scene.instantiate(Shapes.Circle, {});
			yield* Scene.instantiate(Shapes.Group, { children: [circle] });
			yield* Scene.tick;
			runner.destroy(circle);
			yield* Scene.tick;
		});
		const before = frames[0]!;
		const after = frames[1]!;
		const groupId = (
			before.instances[before.root]!.data as { children: string[] }
		).children[0]!;
		expect(
			(before.instances[groupId]!.data as { children: string[] }).children,
		).toHaveLength(1);
		expect(
			(after.instances[groupId]!.data as { children: string[] }).children,
		).toHaveLength(0);
	});

	it("reordering children controls paint order", async () => {
		const frame = frameOf(
			{ a: circleAt(1), b: circleAt(2) },
			["b", "a"], // reversed
		);
		const svg = await Effect.runPromise(renderString(frame));
		expect(svg.indexOf('cx="2"')).toBeLessThan(svg.indexOf('cx="1"'));
	});
});

describe("polymorphic children", () => {
	const collectFrames = async (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	) => {
		const scene = Scene.make(make as never);
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
		);
		return [...frames];
	};

	const childrenOf = (frame: Scene.Frame<any>, id: string) =>
		(frame.instances[id]!.data as { children: string[] }).children;

	it("a string child becomes a Text", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate(Shapes.Group, { children: ["hello"] });
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		const groupId = childrenOf(frame, frame.root)[0]!;
		const childId = childrenOf(frame, groupId)[0]!;
		expect(frame.instances[childId]!.entity.name).toBe("shapes/Text");
		expect((frame.instances[childId]!.data as { text: string }).text).toBe(
			"hello",
		);
	});

	it("a not-yielded nested instantiate is resolved internally", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate(Shapes.Group, {
				// the nested instantiate is NOT itself yield*-ed
				children: [Scene.instantiate(Shapes.Circle, { x: 7 })],
			});
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		const groupId = childrenOf(frame, frame.root)[0]!;
		const childId = childrenOf(frame, groupId)[0]!;
		expect(frame.instances[childId]!.entity.name).toBe("shapes/Circle");
	});

	it("an already-instantiated child contributes its id and is reparented", async () => {
		const frames = await collectFrames(function* () {
			const circle = yield* Scene.instantiate(Shapes.Circle, { x: 3 });
			yield* Scene.instantiate(Shapes.Group, { children: [circle] });
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		// only the group at top level — the circle moved out of root
		expect(childrenOf(frame, frame.root)).toHaveLength(1);
		const groupId = childrenOf(frame, frame.root)[0]!;
		expect(childrenOf(frame, groupId)).toHaveLength(1);
	});

	it("mixed children preserve order", async () => {
		const frames = await collectFrames(function* () {
			const mid = yield* Scene.instantiate(Shapes.Circle, { x: 1 });
			yield* Scene.instantiate(Shapes.Group, {
				children: ["a", mid, Scene.instantiate(Shapes.Circle, { x: 2 })],
			});
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		const groupId = childrenOf(frame, frame.root)[0]!;
		const kids = childrenOf(frame, groupId);
		expect(kids).toHaveLength(3);
		expect(frame.instances[kids[0]!]!.entity.name).toBe("shapes/Text");
		expect(frame.instances[kids[1]!]!.entity.name).toBe("shapes/Circle");
		expect(frame.instances[kids[2]!]!.entity.name).toBe("shapes/Circle");
	});
});

describe("builtin $visible", () => {
	const collectFrames = async (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	) => {
		const scene = Scene.make(make as never);
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
		);
		return [...frames];
	};

	it("defaults to visible and is carried on the frame", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 1 });
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		const id = (frame.instances[frame.root]!.data as { children: string[] })
			.children[0]!;
		expect(frame.instances[id]!.$visible).toBe(true);
	});

	it("a hidden instance is skipped by the renderer", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate(Shapes.Circle, { x: 1, $visible: false });
			yield* Scene.instantiate(Shapes.Circle, { x: 2 });
			yield* Scene.tick;
		});
		const frame = frames[0]!;
		const svg = await Effect.runPromise(renderString(frame));
		expect(svg).not.toContain('cx="1"'); // hidden
		expect(svg).toContain('cx="2"'); // visible
	});
});
