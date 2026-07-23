// Generate the API reference from TSDoc comments into the docs site.
//
// TypeDoc emits plain markdown; Fumadocs wants MDX with frontmatter and a
// meta.json per directory for the sidebar. This script runs TypeDoc once per
// package, then adapts the output:
//
//   - adds `title`/`description` frontmatter (Fumadocs requires a title)
//   - escapes the `{`/`<` sequences MDX would try to evaluate as JSX
//   - writes meta.json so the sidebar lists packages in a chosen order
//
// Regenerate with `pnpm docs:api`. The output is committed, so the docs site
// builds without TypeScript or TypeDoc in its dependency graph.

import { execFileSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outRoot = join(root, "apps/docs/content/docs/api");

/** packages in sidebar order, with the blurb shown on the index page */
const packages = [
	{
		dir: "motion",
		name: "effect-motion",
		/** the module directory TypeDoc nests output under */
		moduleDir: "effect-motion",
		title: "effect-motion",
		description: "Scenes, entities, animators — the core authoring API.",
	},
	{
		dir: "renderer",
		name: "@effect-motion/renderer",
		/** the module directory TypeDoc nests output under */
		moduleDir: "@effect-motion/renderer",
		title: "renderer",
		description:
			"Drawing frames with three.js and WebGPU, in the browser or headless.",
	},
	{
		dir: "three",
		name: "@effect-motion/three",
		/** the module directory TypeDoc nests output under */
		moduleDir: "@effect-motion/three",
		title: "three",
		description:
			"The Effect wrapper over three.js that the renderer is built on.",
	},
	{
		dir: "react",
		name: "@effect-motion/react",
		/** the module directory TypeDoc nests output under */
		moduleDir: "@effect-motion/react",
		title: "react",
		description: "The <Player> component for playing scenes in the browser.",
	},
];

const walk = (dir, ext = ".md") => {
	const out = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) {
			out.push(...walk(full, ext));
		} else if (entry.endsWith(ext)) {
			out.push(full);
		}
	}
	return out;
};

/**
 * TypeDoc writes plain markdown, which MDX then parses as JSX. Generic
 * signatures and object types in prose would be read as elements or
 * expressions and break the build.
 *
 * TypeDoc already escapes most of them, so this only handles the ones it
 * left — hence the lookbehind: double-escaping (`\\{`) is what actually
 * breaks MDX. Fenced blocks and inline code spans are left alone.
 */
const escapeMdx = (source) => {
	const lines = source.split("\n");
	let inFence = false;
	return lines
		.map((line) => {
			if (line.trimStart().startsWith("```")) {
				inFence = !inFence;
				return line;
			}
			if (inFence) {
				return line;
			}
			// leave inline code spans alone; escape only the bare text between them
			return line
				.split(/(`[^`]*`)/)
				.map((part) =>
					part.startsWith("`") ? part : part.replace(/(?<!\\)([<{}])/g, "\\$1"),
				)
				.join("");
		})
		.join("\n");
};

/**
 * First real sentence of the body, for the frontmatter description.
 *
 * Skips headings, signatures, tables, source links, and list items — an
 * index page is mostly links, and a half-rendered link reads worse as a
 * description than nothing at all.
 */
const firstProse = (body) => {
	for (const line of body.split("\n")) {
		const t = line.trim();
		if (
			t === "" ||
			t.startsWith("#") ||
			t.startsWith(">") ||
			t.startsWith("```") ||
			t.startsWith("|") ||
			t.startsWith("-") ||
			t.startsWith("*") ||
			t.startsWith("Defined in:") ||
			t.startsWith("***")
		) {
			continue;
		}
		// a line that is mostly a markdown link is navigation, not prose
		if (/\[[^\]]+\]\([^)]+\)/.test(t)) {
			continue;
		}
		return t.replace(/[[\]]/g, "").replace(/\\/g, "").slice(0, 150);
	}
	return "";
};

const yamlQuote = (s) => `"${s.replace(/\\/g, "").replace(/"/g, '\\"')}"`;

// the index page is hand-written — keep it across regenerations
const indexPath = join(outRoot, "index.mdx");
let indexPage = null;
try {
	indexPage = readFileSync(indexPath, "utf8");
} catch {
	// first run: no index yet
}
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });
if (indexPage !== null) {
	writeFileSync(indexPath, indexPage);
}

for (const pkg of packages) {
	const out = join(outRoot, pkg.title);
	console.log(`• ${pkg.name}`);
	execFileSync(
		"npx",
		[
			"typedoc",
			"--options",
			join(root, "typedoc.base.json"),
			"--tsconfig",
			join(root, "packages", pkg.dir, "tsconfig.json"),
			"--out",
			out,
			join(root, "packages", pkg.dir, "src/index.ts"),
		],
		{ cwd: root, stdio: ["ignore", "ignore", "inherit"] },
	);

	// TypeDoc nests output under a directory named after the module
	// ("renderer/@effect-motion/renderer/namespaces/..."), which reads as
	// doubled crumbs in the sidebar. Collapse those segments and rewrite the
	// links that pointed through them.
	const hoistedSegments = [];
	for (const segment of (pkg.moduleDir ?? pkg.name).split("/")) {
		const nested = join(out, segment);
		if (!existsSync(nested) || !statSync(nested).isDirectory()) {
			break;
		}
		for (const entry of readdirSync(nested)) {
			renameSync(join(nested, entry), join(out, entry));
		}
		rmSync(nested, { recursive: true, force: true });
		hoistedSegments.push(segment);
	}
	const hoisted = hoistedSegments.join("/");

	for (const file of walk(out)) {
		let raw = readFileSync(file, "utf8");
		if (hoisted !== "") {
			// Hoisting moved files up, so TypeDoc's relative links no longer
			// resolve. Rather than patch the strings, resolve each link against
			// where the file USED to be, then re-derive it from where it is now —
			// path math the platform already knows how to do correctly.
			const wasDir = join(out, hoisted, relative(out, dirname(file)));
			raw = raw.replace(
				/\]\(([^)#]+)(#[^)]*)?\)/g,
				(whole, target, hash = "") => {
					if (/^(?:https?:|\/)/.test(target)) {
						return whole;
					}
					// The package README is written at the root and was never moved,
					// so its links still name the hoisted segment directly.
					const from =
						file.endsWith("README.md") && dirname(file) === out ? out : wasDir;
					const absolute = resolve(from, target);
					// links into the hoisted segment land at their post-hoist home
					const withinModule = relative(join(out, hoisted), absolute);
					const finalPath = withinModule.startsWith("..")
						? absolute
						: join(out, withinModule);
					const next = relative(dirname(file), finalPath);
					return `](${next.startsWith(".") ? next : `./${next}`}${hash})`;
				},
			);
		}

		// point every intra-doc link at the file that actually gets written:
		// README.md becomes the directory's index, and .md becomes .mdx
		raw = raw.replace(
			/\]\(([^)]+?)\.md(#[^)]*)?\)/g,
			(_m, path, hash = "") =>
				`](${path.endsWith("README") ? `${path.slice(0, -"README".length)}index` : path}.mdx${hash})`,
		);
		const body = escapeMdx(raw);
		// The filename is the symbol, except for a README, which indexes the
		// directory it sits in — title those after that directory (the
		// namespace), or the package at the root. Otherwise every namespace
		// index shows up in the sidebar as the package name.
		const isReadme = file.endsWith("README.md");
		const parent = basename(dirname(file));
		const base = isReadme
			? dirname(file) === out
				? pkg.title
				: parent
			: basename(file, ".md");
		const description = firstProse(body);
		const frontmatter = [
			"---",
			`title: ${yamlQuote(base)}`,
			description ? `description: ${yamlQuote(description)}` : null,
			"---",
			"",
		]
			.filter((l) => l !== null)
			.join("\n");
		// Fumadocs treats `index` as a directory's own page; TypeDoc names it
		// README, which would only be reachable at ".../Motion/README".
		const target = isReadme
			? join(dirname(file), "index.mdx")
			: file.replace(/\.md$/, ".mdx");
		writeFileSync(target, `${frontmatter}${body}`);
		rmSync(file);
	}

	// index of the package's own tree
	writeFileSync(
		join(out, "meta.json"),
		`${JSON.stringify({ title: pkg.title, pages: ["index", "..."] }, null, "\t")}\n`,
	);
}

// top-level ordering for the API section
writeFileSync(
	join(outRoot, "meta.json"),
	`${JSON.stringify(
		{
			title: "API Reference",
			pages: ["index", ...packages.map((p) => p.title)],
		},
		null,
		"\t",
	)}\n`,
);

console.log(
	`\nGenerated ${walk(outRoot, ".mdx").length} pages for ${packages.length} packages → ${relative(root, outRoot)}`,
);
