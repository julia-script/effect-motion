import * as vscode from "vscode";
import * as Scenes from "../Scenes.js";
import * as settings from "./settings.js";

const lens = (
	document: vscode.TextDocument,
	offset: number,
	command: vscode.Command,
): vscode.CodeLens => {
	const position = document.positionAt(offset);
	return new vscode.CodeLens(new vscode.Range(position, position), command);
};

/**
 * The command an anchor offers.
 *
 * @remarks
 * A scene's lens opens the studio rather than rendering: `motion render`
 * executes a render ENTRYPOINT (a module default-exporting an Effect), not
 * a scene module, so offering a render lens on a scene would promise
 * something the CLI cannot do. It also passes no file argument — the CLI
 * resolves its own default entrypoint, which is the right answer from a
 * scene file.
 */
const commandFor = (anchor: Scenes.Anchor, uri: vscode.Uri): vscode.Command => {
	const named =
		anchor.displayName === undefined ? "" : ` — ${anchor.displayName}`;
	const commands: Record<Scenes.AnchorKind, vscode.Command> = {
		scene: {
			title: `$(play) Studio${named}`,
			command: "effect-motion.openStudio",
			tooltip: "Preview this project's scenes with motion studio",
		},
		studio: {
			title: "$(play) Open studio",
			command: "effect-motion.openStudio",
			arguments: [uri],
			tooltip: "Serve this entrypoint with motion studio",
		},
		render: {
			title: "$(desktop-download) Render",
			command: "effect-motion.render",
			arguments: [uri],
			tooltip: "Run this entrypoint with motion render",
		},
	};
	return commands[anchor.kind];
};

/** Run lenses above scenes and entrypoints. */
export const provider: vscode.CodeLensProvider = {
	provideCodeLenses(document) {
		if (!settings.codeLens()) return [];
		const source = document.getText();
		return Scenes.anchors(source).map((anchor) =>
			lens(document, anchor.offset, commandFor(anchor, document.uri)),
		);
	},
};
