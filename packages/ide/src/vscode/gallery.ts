import * as vscode from "vscode";
import * as Docs from "../Docs.js";
import * as Easings from "../Easings.js";
import * as Springs from "../Springs.js";
import * as settings from "./settings.js";

let panel: vscode.WebviewPanel | undefined;

/**
 * Insert into the editor that was focused before the gallery took focus,
 * falling back to the clipboard when there is none.
 */
const deliver = async (value: string): Promise<void> => {
	const editor = vscode.window.visibleTextEditors.find(
		(candidate) => candidate.document.uri.scheme !== "output",
	);
	if (editor === undefined) {
		await vscode.env.clipboard.writeText(value);
		await vscode.window.showInformationMessage(
			`effect-motion: copied ${value} to the clipboard.`,
		);
		return;
	}
	await editor.edit((builder) => {
		for (const selection of editor.selections)
			builder.replace(selection, value);
	});
};

/**
 * Every easing and spring preset, drawn side by side.
 *
 * @remarks
 * Choosing a curve is a comparison problem — `easeOutQuart` versus
 * `easeOutQuint` is not a question a name answers — and comparison is
 * exactly what a hover, which shows one curve at a time, cannot do.
 */
export const show = (context: vscode.ExtensionContext): void => {
	const theme = settings.theme();
	if (panel !== undefined) {
		panel.webview.html = Docs.gallery(theme);
		panel.reveal(vscode.ViewColumn.Beside, true);
		return;
	}

	panel = vscode.window.createWebviewPanel(
		"effectMotion.gallery",
		"effect-motion curves",
		{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
		{ enableScripts: true, retainContextWhenHidden: true },
	);
	panel.webview.html = Docs.gallery(theme);

	panel.webview.onDidReceiveMessage(
		(message: { type?: string; value?: string }) => {
			if (message.type !== "insert" || typeof message.value !== "string")
				return;
			void deliver(message.value);
		},
		undefined,
		context.subscriptions,
	);

	panel.onDidDispose(
		() => {
			panel = undefined;
		},
		undefined,
		context.subscriptions,
	);

	context.subscriptions.push(
		vscode.window.onDidChangeActiveColorTheme(() => {
			if (panel !== undefined)
				panel.webview.html = Docs.gallery(settings.theme());
		}),
	);
};

/** A quick pick over the same catalog, for when the keyboard is faster. */
export const quickPick = async (): Promise<void> => {
	const items: vscode.QuickPickItem[] = [
		{ label: "Easings", kind: vscode.QuickPickItemKind.Separator },
		...Easings.easings.map((easing) => ({
			label: easing.name,
			description: easing.family,
			detail: easing.summary,
		})),
		{ label: "Spring presets", kind: vscode.QuickPickItemKind.Separator },
		...Springs.presets.map((preset) => ({
			label: preset.name,
			description: "spring",
			detail: preset.summary,
		})),
	];

	const picked = await vscode.window.showQuickPick(items, {
		title: "effect-motion — insert a curve name",
		matchOnDetail: true,
	});
	if (picked === undefined) return;
	await deliver(`"${picked.label}"`);
};
