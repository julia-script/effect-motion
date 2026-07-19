import { readFileSync } from "node:fs";

const pkg = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string; dependencies: { effect: string } };

/**
 * Exact versions a scaffolded project is pinned to — derived from this CLI
 * build's own package.json so they can never go stale. All @effect-motion/*
 * packages release in lockstep (the changesets `fixed` group), so the CLI's
 * own version IS the pin for the others. The effect pin is a determinism
 * invariant (upgrading effect can change seeded random sequences), so
 * scaffolds never use ranges or `latest`.
 */
export const PINS = {
	effect: pkg.dependencies.effect,
	"effect-motion": pkg.version,
	"@effect-motion/react": pkg.version,
	"@effect-motion/export": pkg.version,
	"@effect-motion/cli": pkg.version,
} as const;

/** Non-determinism-critical companions; ranges are fine here. */
export const COMPANIONS = {
	react: "^19.2.0",
	"react-dom": "^19.2.0",
	typescript: "^7.0.2",
	"@types/react": "^19.2.0",
	"@types/react-dom": "^19.2.0",
	"@types/node": "^26.1.1",
} as const;
