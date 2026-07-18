/**
 * Exact versions a scaffolded project is pinned to — the set this CLI
 * release was built and tested against. The effect pin is a determinism
 * invariant (upgrading effect can change seeded random sequences), so
 * scaffolds never use ranges or `latest`. Updated by the CLI's own release
 * process.
 */
export const PINS = {
	effect: "4.0.0-beta.98",
	"effect-motion": "0.2.0",
	"@effect-motion/react": "0.2.0",
	"@effect-motion/export": "0.2.0",
	"@effect-motion/cli": "0.1.0",
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
