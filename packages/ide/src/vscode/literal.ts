import type * as vscode from "vscode";

/** A quoted string on one line, tolerating escapes. */
const STRING = /(["'])(?:[^\\"'\n]|\\.)*?\1/;

export interface HoveredLiteral {
	readonly range: vscode.Range;
	/** The contents, without quotes. */
	readonly text: string;
}

/**
 * The single-line string literal under `position`, if there is one.
 *
 * @remarks
 * Every name this extension documents — easings, spring presets, entity
 * tags, durations — is a short string argument, so a word-range probe is
 * enough and costs nothing. Template literals are deliberately excluded:
 * an interpolated name is not a name the catalog can look up.
 */
export const at = (
	document: vscode.TextDocument,
	position: vscode.Position,
): HoveredLiteral | undefined => {
	const range = document.getWordRangeAtPosition(position, STRING);
	if (range === undefined) return undefined;
	const raw = document.getText(range);
	return { range, text: raw.slice(1, -1) };
};
