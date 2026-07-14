# Design: add-font-loading

## Context

`Shapes.Text` carries a `fontFamily` string; the shared render function in `svg/shapes.ts` emits it (expanded per `add-text-font-fallback` for lone generics) identically through both sinks. Nothing today makes a *named* family resolve: the browser falls back silently, and resvg renders whatever it finds on the system. Two existing mechanisms are load-bearing for this design:

- **Scene annotations** (`Scene.annotate`, spec `scene-metadata`): a Context on the scene value that the runtime never reads — built for exactly this kind of tooling-facing metadata, currently without a real customer.
- **Resvg options passthrough** (spec `resvg-rasterization`): `rasterize` already accepts resvg's `font` options (`fontFiles`, `loadSystemFonts`, …) untranslated.

A further constraint simplifies everything: the engine cannot measure text (documented on `Shapes.Text`), so fonts can never affect frame data. Font loading is purely a display/rasterization concern — it cannot break determinism of frames, only their appearance.

## Goals / Non-Goals

**Goals:**
- A scene is self-describing about the fonts it uses, the same way frames are self-describing about size and background.
- The player draws its first visible frame with the declared fonts (no flash of fallback text).
- The export pipeline can rasterize with the same families, from local font files.
- Shared render functions and both sinks stay byte-identical and untouched.

**Non-Goals:**
- Downloading fonts in the export pipeline (url-only entries are a browser concern; offline export takes paths).
- Bundled font data (`Uint8Array` sources) — add when someone actually needs it.
- Validating that every `Text.fontFamily` names a declared font (cheap tooling warning, later).
- Pixel-identical text across environments — declared fonts make it *achievable* (same file both sides), not automatic.

## Decisions

**Fonts are a scene annotation, not a Runner setting and not entity data.** `Runner.Settings` is consumer-supplied at `run()` time and flows into every `Frame`; fonts are authored *with* the scene and the runtime never reads them — the annotation Context is the mechanism whose documented contract ("tooling-facing metadata; never read by the runtime") matches exactly. Per-entity `src` was rejected because fonts are document-level (one declaration, many text nodes). Consumer-side-only config (Player prop + resvg options, core knows nothing) was rejected because the scene stops being self-describing: handing the scene to another consumer silently loses its fonts.

**Declaration shape: named family + per-environment sources.**

```ts
// packages/motion/src/Fonts.ts
interface FontResource {
  readonly family: string;
  readonly src: { readonly url?: string; readonly path?: string };
  readonly weight?: number;            // CSS font-weight, e.g. 400/700
  readonly style?: "normal" | "italic";
}
export const Fonts = Context.Key<ReadonlyArray<FontResource>>("motion/Fonts");
export const get = (scene) => Context.getOption(scene.annotations, Fonts) // → [] when absent
```

Browsers need URLs, resvg needs files; `src` holds both explicitly and each consumer picks its field. Alternatives rejected: URL-only (export would need network — wrong for an offline rasterizer), a resolver abstraction mapping one source to both (magic, and the mapping is genuinely environment-specific). One entry per face: `Inter` 400 and `Inter` 700 are two entries, mirroring both `@font-face` and resvg's file model.

**Loading happens around rendering, never in it.** Render functions only *name* families, so DOM and string sinks keep emitting identical markup — the invariant from `add-rich-text-spans`/`add-text-font-fallback` is preserved by construction. Each environment prepares itself before pixels:

- **Player** (`usePlayer`): read the annotation off the scene; for each entry with a `url`, construct `new FontFace(family, url(...), { weight, style })`, add to `document.fonts`, and await the loads *alongside* the existing first-frame buffering; `status` stays `'loading'` until both complete. Blocking-by-default is the honest choice for a product whose point is deterministic output; fonts arrive from cache on every mount after the first. A font that fails to load logs a warning and does not block or fail playback — the browser's normal fallback applies, matching today's behavior for undeclared fonts. Entries without a `url` are skipped.
- **Export**: a pure helper `Fonts.resvgOptions(scene)` (in `@effect-motion/export`) returning `{ font: { fontFiles: [...paths] } }` from the annotation's `path` entries, spread into the existing options passthrough. Entries without a `path` are skipped. `loadSystemFonts` is left at resvg's default (on): declared fonts *add* faces; cutting system fonts off is the user's explicit opt-in for full determinism, per the project's explicit-opt-in convention.

**Weight/style metadata is browser-only.** `FontFace` needs the descriptors to variant-match; resvg reads them from the font file itself, so the export helper ignores them. They stay in the shared type because the declaration should be complete where it's written.

## Risks / Trade-offs

- [A slow font URL delays `'ready'`] → failures already don't block, but a *hanging* load would; the browser's own font-loading timeout applies, and entries load concurrently with frame buffering. Accept; a player-level timeout can be added if it bites.
- [`url`/`path` both optional means an entry can be inert] → accepted: an author targeting only the player provides only `url`. Each consumer skips what it can't use; no validation layer for v1.
- [Player and export can still resolve differently if the author points `url` and `path` at different faces] → accepted; the mechanism makes convergence possible, the author owns pointing both at the same font.
- [`document.fonts` is page-global — two players declaring the same family with different sources collide] → accepted; last-added wins per FontFace API semantics, and the collision requires deliberately conflicting declarations.
