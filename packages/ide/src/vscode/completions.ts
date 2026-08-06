import * as vscode from "vscode";
import * as CallContext from "../CallContext.js";
import * as Docs from "../Docs.js";
import * as Durations from "../Durations.js";
import * as Easings from "../Easings.js";
import * as Entities from "../Entities.js";
import * as Imports from "../Imports.js";
import * as Springs from "../Springs.js";
import * as settings from "./settings.js";

/** Durations worth one keystroke; anything else is typed out. */
const COMMON_DURATIONS = [
	"200 millis",
	"400 millis",
	"700 millis",
	"1 second",
	"1500 millis",
	"2 seconds",
];

const item = (
	label: string,
	kind: vscode.CompletionItemKind,
	documentation: string | undefined,
	sortText: string,
	range: vscode.Range,
): vscode.CompletionItem => {
	const entry = new vscode.CompletionItem(label, kind);
	entry.insertText = label;
	entry.filterText = label;
	entry.range = range;
	entry.sortText = sortText;
	if (documentation !== undefined)
		entry.documentation = new vscode.MarkdownString(documentation);
	return entry;
};

const pad = (index: number) => index.toString().padStart(3, "0");

/**
 * Names the language service already knows — with the curve behind them.
 *
 * @remarks
 * TypeScript completes these string literals perfectly well from the union
 * types; what it cannot show is what `easeOutBack` looks like, or that
 * `bounce` rings for two seconds before it settles. These items exist for
 * the documentation window, so they intentionally duplicate what tsserver
 * offers rather than replacing it.
 */
export const provider: vscode.CompletionItemProvider = {
	provideCompletionItems(document, position) {
		if (!settings.completions()) return undefined;
		const source = document.getText();
		if (!Imports.importsEffectMotion(source)) return undefined;

		const offset = document.offsetAt(position);
		const context = CallContext.at(source, offset);
		const literal = context?.literal;
		if (context === undefined || literal === undefined) return undefined;

		const suggestion = CallContext.suggestionAt(source, offset);
		if (suggestion === undefined) return undefined;

		// replace the literal's CONTENTS, quotes left where the author put them
		const start = document.positionAt(literal.start + 1);
		const end = document.positionAt(literal.start + 1 + literal.text.length);
		const range = new vscode.Range(start, end);
		const theme = settings.theme();

		switch (suggestion) {
			case "easing":
				return Easings.easings.map((easing, index) =>
					item(
						easing.name,
						vscode.CompletionItemKind.EnumMember,
						Docs.easing(easing.name, { theme }),
						pad(index),
						range,
					),
				);
			case "spring":
				return Springs.presets.map((preset, index) =>
					item(
						preset.name,
						vscode.CompletionItemKind.EnumMember,
						Docs.spring(preset.name, {
							theme,
							frameRate: settings.frameRate(),
						}),
						pad(index),
						range,
					),
				);
			case "entity":
				return Entities.entities.map((entity, index) =>
					item(
						entity.tag,
						vscode.CompletionItemKind.Class,
						Docs.entity(entity.tag),
						pad(index),
						range,
					),
				);
			case "duration": {
				const frameRate = settings.frameRate();
				return COMMON_DURATIONS.map((value, index) => {
					const entry = item(
						value,
						vscode.CompletionItemKind.Value,
						Docs.duration(value, frameRate),
						pad(index),
						range,
					);
					const info = Durations.describe(value, frameRate);
					if (info !== undefined) entry.detail = `${info.frames} frames`;
					return entry;
				});
			}
		}
	},
};
