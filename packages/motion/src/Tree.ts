import * as Entity from "./Entity.js";

/**
 * The runner's scene graph: id → entry, plus parent/child bookkeeping.
 *
 * An entry holds the entity's current state as a member of the closed union
 * (`Entity.ts`), so reading a field means narrowing on `_tag` rather than
 * casting from `{}`. The entity DEFINITION is not stored — it is resolved
 * from the state's tag when construction is needed.
 */

/** conventional id of the implicit root group every instance attaches to */
export const ROOT_ID = "root";

export interface Entry<Tag extends Entity.EntityTag = Entity.EntityTag> {
	readonly id: string;
	state: Entity.EntityByTag<Tag>;
	parentId: string | null;
}

export type Entryish = Entry | string;

const idOf = (entryish: Entryish): string =>
	typeof entryish === "string" ? entryish : entryish.id;

const nodeNotFound = (entryish: Entryish): never => {
	throw new Error(`Runner: node "${idOf(entryish)}" not found`);
};

/**
 * A parent that cannot hold children. Under the closed union this is knowable
 * from the tag, so the message names what the entity actually is.
 */
const notAContainer = (entry: Entry): never => {
	throw new Error(
		`Runner: parent "${entry.id}" is a ${entry.state._tag}, which cannot have children`,
	);
};

/** the entry's children, or a loud failure if its entity is not a container */
const childrenOrDie = (entry: Entry): ReadonlyArray<string> =>
	Entity.isContainer(entry.state) ? entry.state.children : notAContainer(entry);

export class Tree {
	private idCounter = 0;
	readonly map: Record<string, Entry> = {
		[ROOT_ID]: {
			id: ROOT_ID,
			state: Entity.Group.make({}),
			parentId: null,
		},
	};

	/**
	 * Returns a plain `Entry`, not `Entry<Tag>`: `state` is mutable, so a
	 * tagged entry is invariant and cannot live in a map of mixed tags. The
	 * tag lives on the caller's `Instance<Tag>` instead, which is immutable
	 * and where the narrowing is actually wanted.
	 */
	createNode = (
		state: Entity.Entity,
		// engine-owned singletons (the built-in camera) claim a fixed id
		id: string = `${state._tag}_${this.idCounter++}`,
	): Entry => {
		const entry: Entry = { id, state, parentId: null };
		this.map[id] = entry;
		return entry;
	};

	getEntry = (entryish: Entryish): Entry | null =>
		this.map[idOf(entryish)] ?? null;

	/**
	 * Frames snapshot `entry.state` by reference, so a child-list update must
	 * produce a FRESH object — mutating in place would rewrite frames that
	 * were already emitted.
	 */
	private setChildren = (
		parent: Entry,
		children: ReadonlyArray<string>,
	): void => {
		const state = parent.state;
		// switch, not a cast: spreading a UNION member widens back to the union
		// and loses the tag, so narrow to the concrete tag first and let each
		// branch produce a well-typed Group/Hud.
		switch (state._tag) {
			case "Group":
				parent.state = { ...state, children };
				return;
			case "Hud":
				parent.state = { ...state, children };
				return;
			default:
				notAContainer(parent);
		}
	};

	removeFromParent = (entryish: Entryish): void => {
		const entry = this.getEntry(entryish) ?? nodeNotFound(entryish);
		if (entry.parentId === null) {
			return;
		}
		// a parent that was itself removed: nothing to filter, just detach
		const parent = this.getEntry(entry.parentId);
		if (parent !== null) {
			this.setChildren(
				parent,
				childrenOrDie(parent).filter((childId) => childId !== entry.id),
			);
		}
		entry.parentId = null;
	};

	appendChild = (parentish: Entryish, childish: Entryish): void => {
		const child = this.getEntry(childish) ?? nodeNotFound(childish);
		this.removeFromParent(child);
		const parent = this.getEntry(parentish) ?? nodeNotFound(parentish);
		this.setChildren(parent, [...childrenOrDie(parent), child.id]);
		child.parentId = parent.id;
	};

	insertBefore = (childish: Entryish, beforeish: Entryish): void => {
		const child = this.getEntry(childish) ?? nodeNotFound(childish);
		const before = this.getEntry(beforeish) ?? nodeNotFound(beforeish);
		this.removeFromParent(child);
		if (before.parentId === null) {
			throw new Error(`Runner: before "${before.id}" is not a child`);
		}
		const parent =
			this.getEntry(before.parentId) ?? nodeNotFound(before.parentId);

		const children: Array<string> = [];
		let inserted = false;
		for (const childId of childrenOrDie(parent)) {
			if (childId === before.id) {
				children.push(child.id);
				inserted = true;
			}
			children.push(childId);
		}
		if (!inserted) {
			children.push(child.id);
		}

		this.setChildren(parent, children);
		child.parentId = parent.id;
	};

	remove = (entryish: Entryish): void => {
		const entry = this.getEntry(entryish) ?? nodeNotFound(entryish);
		this.removeFromParent(entry);
		delete this.map[entry.id];
		// orphan its children, and backstop-scan child lists: stays correct even
		// after manual reparenting via raw data updates (which bypass parentId)
		for (const other of Object.values(this.map)) {
			if (other.parentId === entry.id) {
				other.parentId = null;
			}
			if (
				Entity.isContainer(other.state) &&
				other.state.children.includes(entry.id)
			) {
				this.setChildren(
					other,
					other.state.children.filter((childId) => childId !== entry.id),
				);
			}
		}
	};
}
