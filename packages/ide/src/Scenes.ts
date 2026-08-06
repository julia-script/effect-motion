/**
 * Locating the things a code lens can act on.
 *
 * @remarks
 * Three anchors matter in an effect-motion project, and all three are
 * recognisable syntactically:
 *
 * - a scene — `export const x = Scene.make(...)`, optionally with a leading
 *   display-name string;
 * - a studio entrypoint — the `studioConfig({ scenes })` default export
 *   `motion studio` serves;
 * - a render entrypoint — a `Video.render(...)` call `motion render` runs.
 *
 * Regexes rather than the TypeScript AST: a lens provider runs on every
 * keystroke, and none of these need type information.
 */

import * as Imports from "./Imports.js";

export type AnchorKind = "scene" | "studio" | "render";

export interface Anchor {
	readonly kind: AnchorKind;
	/** Offset of the first character of the matched construct. */
	readonly offset: number;
	/**
	 * The binding name for a scene (`scene` in `export const scene = …`), the
	 * render target for a render call, `undefined` when there is none.
	 */
	readonly name: string | undefined;
	/** A scene's display name — `Scene.make("Hello", …)` — when it has one. */
	readonly displayName: string | undefined;
}

const STUDIO = /(?:^|[^A-Za-z0-9_$.])(studioConfig)\s*\(/g;

const RENDER =
	/(?:^|[^A-Za-z0-9_$.])[A-Za-z_$][A-Za-z0-9_$]*\.render\s*\(\s*([A-Za-z_$][A-Za-z0-9_$]*)?/g;

/**
 * Every scene declaration in `source`.
 *
 * @remarks
 * The `Scene` namespace is resolved from the file's own imports rather than
 * assumed, so `import * as S from "effect-motion/Scene"` gets lenses and an
 * unrelated `Schema.make(` does not.
 */
export const scenes = (source: string): ReadonlyArray<Anchor> => {
	const found: Anchor[] = [];
	for (const namespace of Imports.aliases(source, "Scene")) {
		const pattern = new RegExp(
			`(?:^|\\n)[ \\t]*(?:export\\s+)?(?:const|let|var)\\s+([A-Za-z_$][A-Za-z0-9_$]*)[^=\\n]*=\\s*${namespace}\\.make\\s*\\(\\s*(?:(["'])((?:[^\\\\]|\\\\.)*?)\\2)?`,
			"g",
		);
		for (const match of source.matchAll(pattern)) {
			const index = match.index ?? 0;
			// the leading newline is part of the match; the construct starts after it
			const offset = source.startsWith("\n", index) ? index + 1 : index;
			found.push({
				kind: "scene",
				offset,
				name: match[1],
				displayName: match[3],
			});
		}
	}
	return found.sort((a, b) => a.offset - b.offset);
};

/** Every `studioConfig(` call — the studio entrypoint's signature. */
export const studioEntries = (source: string): ReadonlyArray<Anchor> =>
	[...source.matchAll(STUDIO)].map((match) => ({
		kind: "studio" as const,
		offset: (match.index ?? 0) + match[0].indexOf("studioConfig"),
		name: undefined,
		displayName: undefined,
	}));

/**
 * Every `Video.render(scene, …)` call.
 *
 * @remarks
 * `render` is a common word, so this only means anything in a file that
 * imports `@effect-motion/export`; callers gate on that.
 */
export const renderEntries = (source: string): ReadonlyArray<Anchor> =>
	[...source.matchAll(RENDER)].map((match) => ({
		kind: "render" as const,
		offset: (match.index ?? 0) + match[0].search(/[A-Za-z_$]/),
		name: match[1],
		displayName: undefined,
	}));

/**
 * Every anchor a lens should be offered for, in document order.
 *
 * @remarks
 * A file that imports none of the effect-motion packages produces nothing
 * at all, which is what keeps this free in unrelated TypeScript.
 */
export const anchors = (source: string): ReadonlyArray<Anchor> => {
	const out: Anchor[] = [...scenes(source)];
	if (Imports.importsCli(source)) out.push(...studioEntries(source));
	if (Imports.importsExport(source)) out.push(...renderEntries(source));
	return out.sort((a, b) => a.offset - b.offset);
};
