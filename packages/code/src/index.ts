/**
 * Syntax highlighting for effect-motion: Lezer tokenization to Text spans
 * ({@link Highlight}) and selection dimming over the result
 * ({@link Selection}). Everything is authoring-time and pure — frames carry
 * only plain span data.
 */
export * as Code from "./Code.js";
export * as Highlight from "./Highlight.js";
export * as Selection from "./Selection.js";
// Metrics is deliberately NOT re-exported: it carries the font-parsing WASM
// dependency. Import it from "@effect-motion/code/Metrics" when needed.
