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

export const SVG_NS = "http://www.w3.org/2000/svg";

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
