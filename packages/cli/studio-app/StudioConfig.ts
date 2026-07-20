// In-repo typecheck stub: re-exports the CLI's contract module. At prepare
// time this file is NOT copied — the built dist/StudioConfig.js is placed
// next to the app instead, so the app and CLI share one implementation
// resolved against the user's project node_modules.
export * from "../src/StudioConfig.js";
