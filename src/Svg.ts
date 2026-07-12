import { Layer } from "effect";
import * as Effect from "effect/Effect";
import type * as Entity from "./Entity";
import * as Renderer from "./Renderer";

/**
 * Serialized SVG node — the data contract between entity renderers and
 * sinks. Entity renderers return descriptions; sinks own materialization
 * (string folding, DOM creation, namespaces).
 */
export interface SvgNode {
	readonly tag: string;
	readonly props: Record<string, string | number>;
	/** nested nodes, or a string for text content */
	readonly children?: ReadonlyArray<SvgNode> | string;
}

const SVG_NS = "http://www.w3.org/2000/svg";

const escapeAttr = (value: string | number): string =>
	String(value)
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;");

const escapeText = (value: string): string =>
	value.replaceAll("&", "&amp;").replaceAll("<", "&lt;");

export const vnodeToString = (node: SvgNode): string => {
	const props = Object.entries(node.props)
		.map(([key, value]) => ` ${key}="${escapeAttr(value)}"`)
		.join("");
	if (node.children === undefined) {
		return `<${node.tag}${props} />`;
	}
	const children =
		typeof node.children === "string"
			? escapeText(node.children)
			: node.children.map(vnodeToString).join("");
	return `<${node.tag}${props}>${children}</${node.tag}>`;
};

export interface SvgConfig {
	readonly width: number;
	readonly height: number;
}

/** Folds a frame into a single self-contained SVG document string. */
export const SvgRenderer = Renderer.make<SvgNode, SvgConfig>()("SvgRenderer", {
	render: (entities, config) =>
		Effect.gen(function* () {
			let svg = `<svg xmlns="${SVG_NS}" width="${config.width}" height="${config.height}">`;
			for (const { render } of entities) {
				svg += vnodeToString(yield* render);
			}
			return `${svg}</svg>`;
		}),
});

export interface SvgDomConfig {
	readonly target: HTMLElement;
	readonly width: number;
	readonly height: number;
}

const createSvgElement = (doc: Document, node: SvgNode): Element => {
	// namespace is sink-owned: entity renderers never see it
	const el = doc.createElementNS(SVG_NS, node.tag);
	for (const [key, value] of Object.entries(node.props)) {
		el.setAttribute(key, String(value));
	}
	if (typeof node.children === "string") {
		el.textContent = node.children;
	} else if (node.children !== undefined) {
		for (const child of node.children) {
			el.append(createSvgElement(doc, child));
		}
	}
	return el;
};

/**
 * Materializes a frame into `target` as live DOM.
 *
 * ponytail: clear-and-rebuild per frame; upgrade to keyed reconciliation
 * (instance ids are stable keys) inside this sink if it ever gets slow.
 */
export const SvgDomRenderer = Renderer.make<SvgNode, SvgDomConfig>()(
	"SvgDomRenderer",
	{
		render: (entities, config) =>
			Effect.gen(function* () {
				const doc = config.target.ownerDocument;
				const root = doc.createElementNS(SVG_NS, "svg");
				root.setAttribute("width", String(config.width));
				root.setAttribute("height", String(config.height));
				for (const { render } of entities) {
					root.append(createSvgElement(doc, yield* render));
				}
				config.target.replaceChildren(root);
			}),
	},
);

/**
 * Register one SvgNode render function for an entity with BOTH sinks.
 *
 * Entity renderer context keys are per renderer family
 * (`SvgRenderer/<name>` and `SvgDomRenderer/<name>`), so sharing a render
 * function across sinks means registering it twice — this does both.
 */
export const entityRendererLayer = <const Ent extends Entity.AnyEntity>(
	entity: Ent,
	render: Renderer.RenderFunction<SvgNode, Ent>,
) =>
	Layer.mergeAll(
		SvgRenderer.makeEntityRendererLayer(entity, render),
		SvgDomRenderer.makeEntityRendererLayer(entity, render),
	);

/** Both sinks' frame renderers, ready to provide. */
export const layer = Layer.mergeAll(SvgRenderer.layer, SvgDomRenderer.layer);
