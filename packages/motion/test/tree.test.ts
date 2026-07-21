import { describe, expect, it } from "vitest";
import * as S from "../src/schemas";
import { ROOT_ID, Tree } from "../src/Tree";
import { unreachable } from "./support/raise";

const childrenOf = (tree: Tree, id: string): ReadonlyArray<string> => {
	const state = (tree.getEntry(id) ?? unreachable()).state;
	return S.isContainer(state) ? state.children : unreachable();
};

describe("Tree", () => {
	it("starts with a root group", () => {
		const tree = new Tree();
		const root = tree.getEntry(ROOT_ID) ?? unreachable();
		expect(root.state._tag).toBe("Group");
		expect(childrenOf(tree, ROOT_ID)).toEqual([]);
	});

	it("ids are derived from the entity tag", () => {
		const tree = new Tree();
		expect(tree.createNode(S.Circle.make({})).id).toBe("Circle_0");
		expect(tree.createNode(S.Rect.make({})).id).toBe("Rect_1");
		// engine-owned singletons claim a fixed id
		expect(tree.createNode(S.Camera.make({}), "camera").id).toBe("camera");
	});

	it("appendChild attaches, and detaches from a previous parent", () => {
		const tree = new Tree();
		const a = tree.createNode(S.Group.make({}));
		const b = tree.createNode(S.Group.make({}));
		const child = tree.createNode(S.Circle.make({}));

		tree.appendChild(a, child);
		expect(childrenOf(tree, a.id)).toEqual([child.id]);
		expect(child.parentId).toBe(a.id);

		// moving it must never leave it double-referenced
		tree.appendChild(b, child);
		expect(childrenOf(tree, a.id)).toEqual([]);
		expect(childrenOf(tree, b.id)).toEqual([child.id]);
		expect(child.parentId).toBe(b.id);
	});

	it("insertBefore preserves order", () => {
		const tree = new Tree();
		const group = tree.createNode(S.Group.make({}));
		const first = tree.createNode(S.Circle.make({}));
		const last = tree.createNode(S.Circle.make({}));
		const middle = tree.createNode(S.Circle.make({}));

		tree.appendChild(group, first);
		tree.appendChild(group, last);
		tree.insertBefore(middle, last);

		expect(childrenOf(tree, group.id)).toEqual([first.id, middle.id, last.id]);
	});

	it("remove detaches, deletes, and orphans its children", () => {
		const tree = new Tree();
		const group = tree.createNode(S.Group.make({}));
		const child = tree.createNode(S.Circle.make({}));
		tree.appendChild(ROOT_ID, group);
		tree.appendChild(group, child);

		tree.remove(group);

		expect(tree.getEntry(group.id)).toBeNull();
		expect(childrenOf(tree, ROOT_ID)).toEqual([]);
		// the child survives, orphaned
		expect(tree.getEntry(child.id)).not.toBeNull();
		expect(child.parentId).toBeNull();
	});

	it("state updates are fresh objects, never mutated in place", () => {
		// frames snapshot state by reference: mutating would rewrite history
		const tree = new Tree();
		const group = tree.createNode(S.Group.make({}));
		const before = group.state;
		tree.appendChild(group, tree.createNode(S.Circle.make({})));
		expect(group.state).not.toBe(before);
		expect(S.isContainer(before) ? before.children : unreachable()).toEqual([]);
	});

	it("a non-container parent fails loudly, naming what it is", () => {
		const tree = new Tree();
		const circle = tree.createNode(S.Circle.make({}));
		const child = tree.createNode(S.Rect.make({}));
		expect(() => tree.appendChild(circle, child)).toThrow(
			/Circle.*cannot have children/,
		);
	});

	it("a missing node fails loudly, naming the id", () => {
		const tree = new Tree();
		expect(() => tree.appendChild("nope", ROOT_ID)).toThrow(/"nope" not found/);
	});
});
