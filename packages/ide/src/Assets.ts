/**
 * The editor-agnostic assets, and where to find them on disk.
 *
 * @remarks
 * The grammar and the snippets are plain data files, not VS Code
 * inventions: a TextMate injection grammar loads in Zed, Sublime Text,
 * Shiki, and anything else built on TextMate rules, and the snippet file is
 * ordinary JSON. Editors other than VS Code can install this package and
 * read the paths below rather than vendoring copies that go stale.
 *
 * `catalog` is the same idea for the reference data — every easing, spring
 * preset, and entity tag, with the prose the hovers use — so a language
 * server or a docs page can render effect-motion's vocabulary without
 * depending on an editor API.
 */

import { fileURLToPath } from "node:url";
import * as Easings from "./Easings.js";
import * as Entities from "./Entities.js";
import * as Springs from "./Springs.js";

const asset = (relative: string) =>
	fileURLToPath(new URL(`../assets/${relative}`, import.meta.url));

/** The TextMate injection grammar, as an absolute path. */
export const grammarPath = (): string =>
	asset("syntaxes/effect-motion.injection.json");

/** The snippet file, as an absolute path. */
export const snippetsPath = (): string =>
	asset("snippets/effect-motion.code-snippets");

/** The scope name the grammar registers under. */
export const grammarScope = "effect-motion.injection";

export interface Catalog {
	readonly easings: ReadonlyArray<Easings.Easing>;
	readonly springs: ReadonlyArray<Springs.SpringPreset>;
	readonly entities: ReadonlyArray<Entities.EntityInfo>;
}

/** Every documented name the library accepts, as plain data. */
export const catalog = (): Catalog => ({
	easings: Easings.easings,
	springs: Springs.presets,
	entities: Entities.entities,
});
