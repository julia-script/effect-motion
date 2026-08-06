import * as vscode from "vscode";
import * as Docs from "../Docs.js";
import * as Imports from "../Imports.js";
import * as literal from "./literal.js";
import * as settings from "./settings.js";

const markdown = (value: string) => {
	const md = new vscode.MarkdownString(value);
	// curve previews are inline SVG data URIs, which markdown images allow
	// but only for content the extension itself produced
	md.supportHtml = false;
	md.isTrusted = false;
	return md;
};

/**
 * Curve previews and reference notes on the strings a scene is written in.
 *
 * @remarks
 * The language service already tells you `"easeOutBack"` is a valid
 * `TimingInput`. What it cannot tell you is that the curve overshoots and
 * comes back, or that `"400 millis"` is 24 frames — and those are the facts
 * you actually need while pacing a scene.
 */
export const provider: vscode.HoverProvider = {
	provideHover(document, position) {
		if (!settings.hovers()) return undefined;
		const source = document.getText();
		if (!Imports.importsEffectMotion(source)) return undefined;

		const found = literal.at(document, position);
		if (found === undefined) return undefined;

		const theme = settings.theme();
		const body =
			Docs.easing(found.text, { theme }) ??
			Docs.spring(found.text, { theme, frameRate: settings.frameRate() }) ??
			Docs.entity(found.text) ??
			Docs.duration(found.text, settings.frameRate());
		if (body === undefined) return undefined;

		return new vscode.Hover(markdown(body), found.range);
	},
};
