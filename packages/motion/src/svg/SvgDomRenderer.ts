import * as Effect from "effect/Effect";
import * as Renderer from "../Renderer";
import { wrapProjected } from "./project";
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
				const width = config.width ?? meta.width;
				const height = config.height ?? meta.height;
				const root = doc.createElementNS(SVG_NS, "svg");
				root.setAttribute("width", String(width));
				root.setAttribute("height", String(height));
				root.append(
					createSvgElement(doc, {
						tag: "rect",
						props: {
							width: "100%",
							height: "100%",
							fill: meta.backgroundColor,
						},
					}),
				);
				// entities arrive depth-sorted (far→near); wrap each in its
				// camera projection and append in that order
				for (const { render, projection } of entities) {
					const wrapped = wrapProjected(yield* render, projection);
					if (wrapped !== null) {
						root.append(createSvgElement(doc, wrapped));
					}
				}
				config.target.replaceChildren(root);
			}),
	},
);
