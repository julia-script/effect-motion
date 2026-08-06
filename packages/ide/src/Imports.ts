/**
 * Which identifiers an effect-motion namespace is reachable through in a
 * file.
 *
 * @remarks
 * The library is used two ways, and both are idiomatic:
 *
 * ```typescript
 * import * as Color from "effect-motion/Color";  // deep, the recommended form
 * import { Color, Scene } from "effect-motion";  // barrel
 * ```
 *
 * plus either with an alias (`import { Entity as S }` appears throughout the
 * examples). Every provider needs the same answer — "what is `Color` called
 * here?" — so the import scan lives once, in one place.
 *
 * A file that imports nothing from effect-motion yields an empty set, and
 * that is what makes the whole integration free in unrelated TypeScript: no
 * scanning, no decorations, no lenses.
 */

const IMPORT = /\bimport\s+(?!type\b)([\s\S]*?)\s+from\s*["']([^"']+)["']/g;

const STAR = /^\*\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/;

/**
 * The local names bound to `effect-motion`'s `member` export.
 *
 * @remarks
 * Type-only imports are skipped: they cannot appear in the value positions
 * every provider looks at.
 */
export const aliases = (
	source: string,
	member: string,
): ReadonlySet<string> => {
	const found = new Set<string>();
	const deep = `effect-motion/${member}`;
	const named = new RegExp(
		`^\\s*(?:type\\s+)?${member}(?:\\s+as\\s+([A-Za-z_$][A-Za-z0-9_$]*))?\\s*$`,
	);

	for (const match of source.matchAll(IMPORT)) {
		const clause = (match[1] ?? "").trim();
		const module = match[2] ?? "";

		if (module === deep) {
			const star = STAR.exec(clause);
			if (star?.[1] !== undefined) found.add(star[1]);
			continue;
		}
		if (module !== "effect-motion") continue;

		const braces = /\{([\s\S]*?)\}/.exec(clause);
		if (braces?.[1] === undefined) continue;
		for (const binding of braces[1].split(",")) {
			const hit = named.exec(binding);
			if (hit === null) continue;
			found.add(hit[1] ?? member);
		}
	}
	return found;
};

/** Does this file import anything from effect-motion? */
export const importsEffectMotion = (source: string): boolean =>
	/from\s*["']effect-motion(?:\/[^"']*)?["']/.test(source);

/** Does this file import `@effect-motion/export`? */
export const importsExport = (source: string): boolean =>
	/from\s*["']@effect-motion\/export["']/.test(source);

/** Does this file import `@effect-motion/cli`? */
export const importsCli = (source: string): boolean =>
	/from\s*["']@effect-motion\/cli["']/.test(source);
