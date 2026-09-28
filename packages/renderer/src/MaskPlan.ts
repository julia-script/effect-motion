import type { Frame } from "effect-motion/Scene";

type AnyFrame = Frame<unknown>;
export type Tier = "world" | "hud";

export interface Node {
	readonly id: string;
	readonly parentId: string | null;
	readonly domainId: string;
	readonly tier: Tier;
	readonly ancestors: ReadonlyArray<string>;
}

export interface Attachment {
	readonly targetId: string;
	readonly sourceId: string;
	readonly mode: "alpha" | "inverse";
	readonly domainId: string;
	readonly tier: Tier;
}

export interface Plan {
	readonly nodes: ReadonlyMap<string, Node>;
	readonly attachments: ReadonlyMap<string, Attachment>;
	readonly sources: ReadonlySet<string>;
	readonly order: ReadonlyArray<Attachment>;
}

const childrenOf = (frame: AnyFrame, id: string): ReadonlyArray<string> => {
	const data = frame.instances[id]?.data;
	return data !== undefined && "children" in data ? data.children : [];
};

/** Validate frame-authored references before any retained/GPU state changes. */
export const make = (frame: AnyFrame): Plan => {
	const nodes = new Map<string, Node>();
	const visit = (
		id: string,
		parentId: string | null,
		domainId: string,
		tier: Tier,
		ancestors: ReadonlyArray<string>,
	): void => {
		if (nodes.has(id)) {
			throw new Error(
				`Renderer: instance "${id}" has a duplicate parent or cycle`,
			);
		}
		const data = frame.instances[id]?.data;
		if (data === undefined)
			throw new Error(`Renderer: unknown instance id "${id}"`);
		const nextTier = data._tag === "Hud" ? "hud" : tier;
		if (
			data._tag === "Hud" &&
			tier === "world" &&
			parentId !== frame.root &&
			parentId !== domainId
		) {
			throw new Error(`Renderer: Hud "${id}" is nested inside world content`);
		}
		const ancestry = [...ancestors, id];
		nodes.set(id, {
			id,
			parentId,
			domainId,
			tier: nextTier,
			ancestors: ancestry,
		});
		const childDomain = frame.comps[id] === undefined ? domainId : id;
		for (const childId of childrenOf(frame, id)) {
			visit(
				childId,
				id,
				childDomain,
				childDomain === id ? "world" : nextTier,
				ancestry,
			);
		}
	};
	visit(frame.root, null, frame.root, "world", []);
	const attachments = new Map<string, Attachment>();
	const owners = new Map<string, string>();
	for (const [targetId, relation] of Object.entries(frame.masks ?? {})) {
		const sourceId = relation.sourceId;
		const fail = (reason: string): never => {
			throw new Error(
				`Renderer: mask target "${targetId}", source "${sourceId}": ${reason}`,
			);
		};
		const target = nodes.get(targetId) ?? fail("missing or unmounted endpoint");
		const source = nodes.get(sourceId) ?? fail("missing or unmounted endpoint");
		if (
			frame.instances[targetId]?.data._tag === "Camera" ||
			frame.instances[sourceId]?.data._tag === "Camera"
		)
			fail("Camera is not paintable");
		if (relation.mode !== "alpha" && relation.mode !== "inverse")
			fail("invalid mode");
		if (targetId === sourceId) fail("identical endpoints");
		if (
			target.ancestors.includes(sourceId) ||
			source.ancestors.includes(targetId)
		)
			fail("source and target subtrees overlap");
		if (target.domainId !== source.domainId) fail("cross-composition boundary");
		if (target.tier !== source.tier) fail("cross-tier world/Hud boundary");
		const owner = owners.get(sourceId);
		if (owner !== undefined && owner !== targetId)
			fail(`source already masks target "${owner}"`);
		owners.set(sourceId, targetId);
		attachments.set(targetId, {
			targetId,
			sourceId,
			mode: relation.mode,
			domainId: target.domainId,
			tier: target.tier,
		});
	}
	const sources = new Set(owners.keys());
	const ordered: Array<Attachment> = [];
	const active = new Set<string>();
	const done = new Set<string>();
	const dependencies = (attachment: Attachment): ReadonlyArray<Attachment> => {
		const found: Array<Attachment> = [];
		const walk = (id: string): void => {
			const nested = attachments.get(id);
			if (nested !== undefined) found.push(nested);
			for (const childId of childrenOf(frame, id)) {
				if (!sources.has(childId)) walk(childId);
			}
		};
		walk(attachment.sourceId);
		return found;
	};
	const sort = (attachment: Attachment): void => {
		if (done.has(attachment.targetId)) return;
		if (active.has(attachment.targetId)) {
			throw new Error(
				`Renderer: mask target "${attachment.targetId}", source "${attachment.sourceId}": mask reference cycle`,
			);
		}
		active.add(attachment.targetId);
		for (const dependency of dependencies(attachment)) sort(dependency);
		active.delete(attachment.targetId);
		done.add(attachment.targetId);
		ordered.push(attachment);
	};
	for (const attachment of attachments.values()) sort(attachment);
	return { nodes, attachments, sources, order: ordered };
};

/** The factors attached to a drawable in its own composition. */
export const factorsOf = (
	plan: Plan,
	id: string,
): ReadonlyArray<Attachment> => {
	const node = plan.nodes.get(id);
	if (node === undefined) return [];
	return node.ancestors.flatMap((ancestorId) => {
		const attachment = plan.attachments.get(ancestorId);
		return attachment !== undefined && attachment.domainId === node.domainId
			? [attachment]
			: [];
	});
};

/** Source coverage excludes nested roots owned by another attachment. */
export const inSource = (plan: Plan, sourceId: string, id: string): boolean => {
	const ancestry = plan.nodes.get(id)?.ancestors;
	if (ancestry === undefined) return false;
	const at = ancestry.indexOf(sourceId);
	return (
		at >= 0 &&
		!ancestry.slice(at + 1).some((ancestor) => plan.sources.has(ancestor))
	);
};
