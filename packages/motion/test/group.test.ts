import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { describe, expect, it } from "vitest";
import * as Color from "../src/Color";
import * as S from "../src/Entity";
import * as Runner from "../src/Runner";
import * as Scene from "../src/Scene";
import { unreachable } from "./support/raise";

/** a Text's string, or a loud failure — replaces the old `as { text }` */
const textOf = (entry: { data: S.Entity } | undefined) => {
	const data = (entry ?? unreachable()).data;
	return data._tag === "Text" ? data : unreachable();
};

/** a container's children, or a loud failure — replaces the old `as {children}` */
const childrenOf = (entry: { data: S.Entity } | undefined) => {
	const data = (entry ?? unreachable()).data;
	return S.isContainer(data) ? data.children : unreachable();
};

const _frameOf = (
	instances: Scene.Frame["instances"],
	rootChildren: ReadonlyArray<string>,
): Scene.Frame => ({
	instances: {
		...instances,
		root: { data: S.Group.make({ children: rootChildren }) },
	},
	root: "root",
	frameRate: 60,
	width: 500,
	height: 300,
	backgroundColor: Color.hex("#16161d"),
	camera: Runner.identityCameraView(500),
	comps: {},
});

// a white default circle at (x, y); big enough to give a solid painted center
const _circleAt = (x: number, y = 0, radius = 12) => ({
	data: S.Circle.make({ position: S.vec3({ x, y }), radius }),
});

describe("scene attachment", () => {
	const collectFrames = async (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	) => {
		const scene = Scene.make(make as never, { width: 500, height: 300 });
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
		);
		return [...frames];
	};

	it("instances attach to the root by default", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 5 }) });
			yield* Scene.tick;
		});
		const frame = frames[0] ?? unreachable();
		const rootData = frame.instances[frame.root]?.data ?? unreachable();
		const root = S.isContainer(rootData) ? rootData : unreachable();
		expect(root.children).toHaveLength(1);
		expect(frame.instances[root.children[0] ?? unreachable()]?.data._tag).toBe(
			"Circle",
		);
	});

	it("appendChild reparents a lazily-created instance", async () => {
		const frames = await collectFrames(function* () {
			const group = yield* Scene.instantiate("Group", {
				position: S.vec3({ x: 100 }),
			});
			const circle = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 5 }),
			});
			yield* Scene.appendChild(group, circle);
			yield* Scene.tick;
		});
		const frame = frames[0] ?? unreachable();
		const rootData = frame.instances[frame.root]?.data ?? unreachable();
		const root = S.isContainer(rootData) ? rootData : unreachable();
		expect(root.children).toHaveLength(1); // circle moved out of root
		const group = frame.instances[root.children[0] ?? unreachable()]?.data as {
			children: ReadonlyArray<string>;
		};
		expect(group.children).toHaveLength(1);
	});

	it("destroy detaches from the referencing group", async () => {
		const frames = await collectFrames(function* () {
			const runner = yield* Runner.Runner;
			const circle = yield* Scene.instantiate("Circle", {});
			yield* Scene.instantiate("Group", { children: [circle] });
			yield* Scene.tick;
			runner.destroy(circle);
			yield* Scene.tick;
		});
		const before = frames[0] ?? unreachable();
		const after = frames[1] ?? unreachable();
		const groupId =
			childrenOf(before.instances[before.root])[0] ?? unreachable();
		expect(childrenOf(before.instances[groupId])).toHaveLength(1);
		expect(childrenOf(after.instances[groupId])).toHaveLength(0);
	});
});

describe("polymorphic children", () => {
	const collectFrames = async (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	) => {
		const scene = Scene.make(make as never, { width: 500, height: 300 });
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
		);
		return [...frames];
	};

	const childrenIn = (frame: Scene.Frame<any>, id: string) =>
		childrenOf(frame.instances[id]);

	it("a string child becomes a Text", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate("Group", { children: ["hello"] });
			yield* Scene.tick;
		});
		const frame = frames[0] ?? unreachable();
		const groupId = childrenIn(frame, frame.root)[0] ?? unreachable();
		const childId = childrenIn(frame, groupId)[0] ?? unreachable();
		expect(frame.instances[childId]?.data._tag).toBe("Text");
		expect(textOf(frame.instances[childId]).text).toBe("hello");
	});

	it("a not-yielded nested instantiate is resolved internally", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate("Group", {
				// the nested instantiate is NOT itself yield*-ed
				children: [Scene.instantiate("Circle", { position: S.vec3({ x: 7 }) })],
			});
			yield* Scene.tick;
		});
		const frame = frames[0] ?? unreachable();
		const groupId = childrenIn(frame, frame.root)[0] ?? unreachable();
		const childId = childrenIn(frame, groupId)[0] ?? unreachable();
		expect(frame.instances[childId]?.data._tag).toBe("Circle");
	});

	it("an already-instantiated child contributes its id and is reparented", async () => {
		const frames = await collectFrames(function* () {
			const circle = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 3 }),
			});
			yield* Scene.instantiate("Group", { children: [circle] });
			yield* Scene.tick;
		});
		const frame = frames[0] ?? unreachable();
		// only the group at top level — the circle moved out of root
		expect(childrenIn(frame, frame.root)).toHaveLength(1);
		const groupId = childrenIn(frame, frame.root)[0] ?? unreachable();
		expect(childrenIn(frame, groupId)).toHaveLength(1);
	});

	it("mixed children preserve order", async () => {
		const frames = await collectFrames(function* () {
			const mid = yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: 1 }),
			});
			yield* Scene.instantiate("Group", {
				children: [
					"a",
					mid,
					Scene.instantiate("Circle", { position: S.vec3({ x: 2 }) }),
				],
			});
			yield* Scene.tick;
		});
		const frame = frames[0] ?? unreachable();
		const groupId = childrenIn(frame, frame.root)[0] ?? unreachable();
		const kids = childrenIn(frame, groupId);
		expect(kids).toHaveLength(3);
		expect(frame.instances[kids[0] ?? unreachable()]?.data._tag).toBe("Text");
		expect(frame.instances[kids[1] ?? unreachable()]?.data._tag).toBe("Circle");
		expect(frame.instances[kids[2] ?? unreachable()]?.data._tag).toBe("Circle");
	});
});

describe("builtin ~visible", () => {
	const collectFrames = async (
		make: () => Generator<Effect.Effect<any, any, any>, void, never>,
	) => {
		const scene = Scene.make(make as never, { width: 500, height: 300 });
		const frames = await Effect.runPromise(
			Scene.stream(scene as never).pipe(
				Stream.runCollect,
			) as unknown as Effect.Effect<Iterable<Scene.Frame<any>>, never, never>,
		);
		return [...frames];
	};

	it("defaults to visible and is carried on the frame", async () => {
		const frames = await collectFrames(function* () {
			yield* Scene.instantiate("Circle", { position: S.vec3({ x: 1 }) });
			yield* Scene.tick;
		});
		const frame = frames[0] ?? unreachable();
		const id = childrenOf(frame.instances[frame.root])[0] ?? unreachable();
		const entryData = frame.instances[id]?.data ?? unreachable();
		expect("visible" in entryData && entryData.visible).toBe(true);
	});
});
