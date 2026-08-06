// Bundles the VS Code entrypoint to CommonJS.
//
// VS Code loads an extension's `main` through Node's CJS require, while the
// rest of this package is ESM like every other package in the workspace —
// so the extension half gets its own esbuild pass rather than shipping the
// tsc output directly. `vscode` stays external: the host injects it.
//
// The library half (dist/*.js) is plain tsc output and is what npm
// consumers import; only dist/extension.cjs comes from here.

import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = new URL("..", import.meta.url);

await build({
	entryPoints: [fileURLToPath(new URL("src/vscode/extension.ts", root))],
	outfile: fileURLToPath(new URL("dist/extension.cjs", root)),
	bundle: true,
	format: "cjs",
	platform: "node",
	target: "node20",
	external: ["vscode"],
	sourcemap: true,
	logLevel: "info",
});
