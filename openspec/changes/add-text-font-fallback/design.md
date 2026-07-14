# Design: add-text-font-fallback

## Context

`Shapes.Text` defaults `fontFamily` to the generic `"sans-serif"`, and the SVG text renderer emits whatever the data holds, verbatim. Browsers resolve generic families with full variant matching, so bold/italic `<tspan>`s (shipped in `add-rich-text-spans`) work in the player. resvg 2.6.2 — the rasterizer the export pipeline will use — resolves a lone generic family to a single face and ignores `font-weight`/`font-style`; its `sansSerifFamily` remap option does not restore variants either. A spike confirmed that putting a named family first in a fallback list (`Helvetica, sans-serif`) restores correct bold/italic in resvg while remaining valid for browsers.

Both sinks (DOM and string) share one render function per entity — `svg/shapes.ts` is the single place text markup is produced.

## Goals / Non-Goals

**Goals:**
- Emitted `font-family` always leads with named families that resvg can variant-match.
- Both sinks keep emitting identical markup.
- Entity data stays semantic: the schema default remains `"sans-serif"`.

**Non-Goals:**
- Pixel-identical text between browser and resvg (metric drift between resolved faces is accepted; differences get documented over time).
- Custom font loading (separate roadmap item; couples with the export pipeline).
- Mapping `cursive`/`fantasy` — no sane cross-platform named equivalents; they pass through.

## Decisions

**Expand in the shared render function, not per-sink.** The `text` render function in `svg/shapes.ts` applies the expansion, so DOM and string output stay byte-identical — preserving the existing "one entity renderer drives both sinks" invariant. Alternative rejected: a string-sink-only rewrite would need a new per-sink hook and would make the player and export render different markup for the same frame.

**Trigger on a lone generic keyword only.** Expansion applies when the trimmed `fontFamily` is exactly `sans-serif`, `serif`, or `monospace`. Anything else — a named family, or a list like `Inter, sans-serif` — passes through untouched: named-first lists already work in resvg, and rewriting user-provided values would be surprising. Alternative rejected: appending named fallbacks into arbitrary lists.

**Fixed expansion table, pinned in the spec** (macOS name, Windows name, common Linux name, then the original generic so browser resolution still has its normal last resort):

| generic | emitted |
|---|---|
| `sans-serif` | `Helvetica, Arial, DejaVu Sans, sans-serif` |
| `serif` | `Times New Roman, DejaVu Serif, serif` |
| `monospace` | `Courier New, DejaVu Sans Mono, monospace` |

**Schema untouched.** The default stays `"sans-serif"` in `Shapes.Text` — data records intent, rendering resolves it. Tweening, serialization, and existing scenes are unaffected.

## Risks / Trade-offs

- [Browser face may shift on some platforms] — e.g. a Linux browser that resolved `sans-serif` to something other than DejaVu Sans will now get the list's first hit → accepted; the list mirrors what each platform's generic resolves to anyway, and exactness across environments was never promised.
- [Remaining browser/offline metric drift] — same list can still resolve to different faces (Helvetica vs Arial) → accepted per proposal; document differences as they surface. Full determinism arrives with custom fonts feeding both paths.
