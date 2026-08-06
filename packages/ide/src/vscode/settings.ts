import * as vscode from "vscode";
import type * as Docs from "../Docs.js";

/** The documents this extension has anything to say about. */
export const SELECTOR: ReadonlyArray<vscode.DocumentFilter> = [
	"typescript",
	"typescriptreact",
	"javascript",
	"javascriptreact",
].flatMap((language) => [
	{ language, scheme: "file" },
	{ language, scheme: "untitled" },
]);

const config = () => vscode.workspace.getConfiguration("effectMotion");

/**
 * Frames per second used to report durations and spring lengths.
 *
 * @remarks
 * A scene's real frame rate lives in its settings, which this extension
 * deliberately does not evaluate — running user code to colour a hover is
 * not a trade worth making. The setting is the honest stand-in, and every
 * hover says so.
 */
export const frameRate = (): number => {
	const value = config().get<number>("frameRate", 60);
	return Number.isFinite(value) && value > 0 ? value : 60;
};

export const colorDecorators = (): boolean =>
	config().get<boolean>("colorDecorators", true);

export const hovers = (): boolean => config().get<boolean>("hovers", true);

export const completions = (): boolean =>
	config().get<boolean>("completions", true);

export const codeLens = (): boolean => config().get<boolean>("codeLens", true);

export type PackageManager = "pnpm" | "npm" | "yarn" | "bun";

export const packageManagerSetting = (): PackageManager | "auto" =>
	config().get<PackageManager | "auto">("packageManager", "auto");

/** Curve previews follow the editor's theme so they never sit on the wrong background. */
export const theme = (): Docs.Theme => {
	const kind = vscode.window.activeColorTheme.kind;
	return kind === vscode.ColorThemeKind.Light ||
		kind === vscode.ColorThemeKind.HighContrastLight
		? "light"
		: "dark";
};
