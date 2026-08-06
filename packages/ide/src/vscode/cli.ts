import * as vscode from "vscode";
import * as settings from "./settings.js";

const LOCKFILES: ReadonlyArray<readonly [string, settings.PackageManager]> = [
	["pnpm-lock.yaml", "pnpm"],
	["bun.lockb", "bun"],
	["bun.lock", "bun"],
	["yarn.lock", "yarn"],
	["package-lock.json", "npm"],
];

/** The package manager to invoke the CLI through. */
export const packageManager = async (
	folder: vscode.WorkspaceFolder,
): Promise<settings.PackageManager> => {
	const configured = settings.packageManagerSetting();
	if (configured !== "auto") return configured;
	for (const [file, manager] of LOCKFILES) {
		try {
			await vscode.workspace.fs.stat(vscode.Uri.joinPath(folder.uri, file));
			return manager;
		} catch {
			// absent lockfile — keep looking
		}
	}
	return "npm";
};

/** The workspace folder the given document belongs to, or the only one. */
export const folderFor = (
	document: vscode.TextDocument | undefined,
): vscode.WorkspaceFolder | undefined => {
	const folders = vscode.workspace.workspaceFolders ?? [];
	if (document !== undefined) {
		const owner = vscode.workspace.getWorkspaceFolder(document.uri);
		if (owner !== undefined) return owner;
	}
	return folders[0];
};

const TERMINAL_NAME = "effect-motion";

const terminalFor = (folder: vscode.WorkspaceFolder): vscode.Terminal => {
	const existing = vscode.window.terminals.find(
		(candidate) => candidate.name === TERMINAL_NAME,
	);
	if (existing !== undefined) return existing;
	return vscode.window.createTerminal({
		name: TERMINAL_NAME,
		cwd: folder.uri,
	});
};

/**
 * Run `motion <args>` in a reused terminal.
 *
 * @remarks
 * A terminal rather than a task: `motion studio` is a long-lived dev server
 * whose output (the URL it picked, hot-reload notices, scene errors) is the
 * point, and a task's output pane hides it behind an extra click.
 *
 * The command is not executed directly — it goes through the workspace's
 * package manager, so the CLI resolved is the project's own devDependency
 * rather than whatever happens to be on PATH.
 */
export const run = async (
	args: ReadonlyArray<string>,
	document: vscode.TextDocument | undefined,
): Promise<void> => {
	const folder = folderFor(document);
	if (folder === undefined) {
		await vscode.window.showErrorMessage(
			"effect-motion: open a folder before running the motion CLI.",
		);
		return;
	}
	const manager = await packageManager(folder);
	const runner = manager === "npm" ? "npx" : `${manager} exec`;
	const terminal = terminalFor(folder);
	terminal.show(true);
	terminal.sendText(`${runner} motion ${args.join(" ")}`);
};
