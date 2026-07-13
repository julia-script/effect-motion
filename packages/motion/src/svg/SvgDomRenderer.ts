import * as Effect from "effect/Effect";
import * as Renderer from "../Renderer";
import { SVG_NS, type SvgNode } from "./SvgNode";

export interface SvgDomConfig {
	readonly target: HTMLElement;
	/** viewport size — defaults to the frame's own width/height metadata */
	readonly width?: number;
	readonly height?: number;
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
		render: (entities, config, meta) =>
			Effect.gen(function* () {
				const doc = config.target.ownerDocument;
				const root = doc.createElementNS(SVG_NS, "svg");
				root.setAttribute("width", String(config.width ?? meta.width));
				root.setAttribute("height", String(config.height ?? meta.height));
				root.append(
					createSvgElement(doc, {
						tag: "rect",
						props: { width: "100%", height: "100%", fill: meta.backgroundColor },
					}),
				);
				for (const { render } of entities) {
					root.append(createSvgElement(doc, yield* render));
				}
				config.target.replaceChildren(root);
			}),
	},
);
