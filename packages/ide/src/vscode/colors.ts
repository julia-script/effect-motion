import * as vscode from "vscode";
import * as Colors from "../Colors.js";
import * as settings from "./settings.js";

const toVscode = (rgba: Colors.Rgba) =>
	new vscode.Color(rgba.r / 255, rgba.g / 255, rgba.b / 255, rgba.a);

const fromVscode = (color: vscode.Color): Colors.Rgba => ({
	r: Math.round(color.red * 255),
	g: Math.round(color.green * 255),
	b: Math.round(color.blue * 255),
	a: color.alpha,
});

/**
 * Swatches on `Color.hex`, `rgba`, `hsl`, `lab`, `oklch`, and `tw` — and a
 * picker that writes back.
 *
 * @remarks
 * The constructor is preserved on edit wherever it can express the new
 * colour, so nudging an `oklch` call leaves an `oklch` call. `tw` is the
 * exception (its palette is a closed set of names) and falls back to `hex`.
 *
 * Only literal arguments get a swatch. A colour built from variables is
 * skipped rather than guessed at — a wrong swatch is worse than none.
 */
export const provider: vscode.DocumentColorProvider = {
	provideDocumentColors(document) {
		if (!settings.colorDecorators()) return [];
		const source = document.getText();
		return Colors.scan(source).map(
			(literal) =>
				new vscode.ColorInformation(
					new vscode.Range(
						document.positionAt(literal.start),
						document.positionAt(literal.end),
					),
					toVscode(literal.rgba),
				),
		);
	},

	provideColorPresentations(color, context) {
		const source = context.document.getText();
		const start = context.document.offsetAt(context.range.start);
		const literal = Colors.scan(source).find((found) => found.start === start);
		if (literal === undefined) return [];

		const label = Colors.format(literal, fromVscode(color));
		const presentation = new vscode.ColorPresentation(label);
		presentation.textEdit = vscode.TextEdit.replace(context.range, label);
		return [presentation];
	},
};
