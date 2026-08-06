/**
 * The VS Code entrypoint: register providers, register commands, get out of
 * the way.
 *
 * @remarks
 * Activation deliberately does no work beyond registration. Every provider
 * gates on the document actually importing effect-motion, so the cost in an
 * unrelated TypeScript file is one substring test — which is what makes it
 * safe to activate on `onLanguage:typescript` at all.
 */

import * as vscode from "vscode";
import * as cli from "./cli.js";
import * as colors from "./colors.js";
import * as completions from "./completions.js";
import * as gallery from "./gallery.js";
import * as hovers from "./hovers.js";
import * as lenses from "./lenses.js";
import { SELECTOR } from "./settings.js";

const documentFor = (uri: unknown): vscode.TextDocument | undefined => {
	if (uri instanceof vscode.Uri) {
		return vscode.workspace.textDocuments.find(
			(document) => document.uri.toString() === uri.toString(),
		);
	}
	return vscode.window.activeTextEditor?.document;
};

/** Path relative to the workspace folder, for passing to the CLI. */
const entryArg = (document: vscode.TextDocument | undefined): string[] => {
	if (document === undefined) return [];
	const folder = cli.folderFor(document);
	if (folder === undefined) return [];
	const relative = vscode.workspace.asRelativePath(document.uri, false);
	return [`./${relative}`];
};

export const activate = (context: vscode.ExtensionContext): void => {
	const selector = [...SELECTOR];

	context.subscriptions.push(
		vscode.languages.registerHoverProvider(selector, hovers.provider),
		vscode.languages.registerColorProvider(selector, colors.provider),
		vscode.languages.registerCodeLensProvider(selector, lenses.provider),
		vscode.languages.registerCompletionItemProvider(
			selector,
			completions.provider,
			'"',
			"'",
		),

		vscode.commands.registerCommand("effect-motion.openStudio", (uri) => {
			const document = documentFor(uri);
			// only an explicit entrypoint is passed through; from a scene file
			// the CLI's own default (./studio.ts) is the right answer
			const args =
				uri instanceof vscode.Uri ? entryArg(document) : ([] as string[]);
			return cli.run(["studio", ...args], document);
		}),

		vscode.commands.registerCommand("effect-motion.render", (uri) => {
			const document = documentFor(uri);
			const args =
				uri instanceof vscode.Uri ? entryArg(document) : ([] as string[]);
			return cli.run(["render", ...args], document);
		}),

		vscode.commands.registerCommand("effect-motion.easingGallery", () => {
			gallery.show(context);
		}),

		vscode.commands.registerCommand("effect-motion.insertEasing", () =>
			gallery.quickPick(),
		),
	);
};

export const deactivate = (): void => {
	// every disposable is owned by context.subscriptions
};
