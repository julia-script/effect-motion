# Roadmap — effect-motion

> Direction, not commitment — Now is committed; Next is planned; Later is exploration.
> Only Now items may be promised to anyone. This document changes as we learn.
> Last reviewed: 2026-07-13 · Review cadence: monthly

## Vision

A library for making motion graphics in code: deterministic, frame-exact
scenes of schema-backed entities, composed with Effect. Rendering is a
pluggable layer in the Effect style — SVG is the first backend because it
was the most practical, but the structure admits others (canvas, Lottie) —
and ultimately scenes become actual video files. For developers who'd
rather write a scene than scrub a timeline. It is deliberately not a GUI
editor and not a runtime UI-animation library.

**Current objective:** quiet npm publish (v0.1) — measured by: the packages
install from the registry, and a real video file has been produced
end-to-end through the export pipeline.

## Column rules

- **Now** — problem validated, solution shaped, actively worked or next up. Committed.
- **Next** — problem chosen and understood; solution still in discovery. Planned, not promised.
- **Later** — problem worth solving, no solution chosen. Options, not a queue.

## Now

### Player v2 — playback that works for real scenes
- **Problem:** the current player was built for debugging: ASCII transport
  glyphs, no loop option, aspect ratio ignored — and it collects *all*
  frames before playing, so long scenes start slowly and infinite scenes
  never start at all.
- **Outcome & done-when:** frames play as they're produced (buffered
  streaming, not collect-then-play); an infinite scene plays indefinitely;
  transport uses icons, has a loop toggle, and the viewport respects the
  scene's aspect ratio.
- **Status:** shaped — pain points nailed down. No engine change needed: the
  driver already computes frames lazily; collect-everything-first was a
  player choice. The work is player-side consumption (pull as you play, plus
  a buffering policy) and UI polish.
- **Appetite:** worth ~2 weeks part-time. The streaming model is the
  substance; UI polish rides along.
- **Links:** spec `react-player` · change: none yet — top `/opsx:propose` candidate

### Rich text
- **Problem:** the single-run `Shapes.Text` (shipped 2026-07-13) can't
  express mixed styles — a title with one bold word, multi-color captions.
  Table stakes for motion graphics.
- **Outcome & done-when:** an entity for multi-style text runs, animatable
  through the existing trait/animator pairs like any other shape.
- **Status:** in progress — simple Text shipped as the foundation; the rich
  entity itself is unshaped. The core design question is text measurement:
  positioning run N needs the width of runs 1..N-1, which SVG delegation
  (`textAnchor`/`baseline`) can't answer. Options range from SVG `<tspan>`
  flow (no measurement, limited animation) to a real measurement step.
- **Appetite:** worth ~2 weeks part-time.
- **Links:** change `add-text-entity` (done, ready to archive) · spec `shapes`

## Next

### Video export — scenes become files (SVG → PNG → MP4)
- **Problem:** scenes only exist inside the browser player; there is no way
  to produce an artifact you can share or upload.
- **Hypothesis:** a staged pipeline where each stage is useful alone —
  (1) SVG file per frame, reusing the existing string sink; (2) rasterize
  to PNG per frame via [resvg](https://github.com/linebender/resvg);
  (3) encode PNGs to video via ffmpeg.
- **Confidence:** high for stage 1 (the string renderer exists); med for 2–3.
- **Assumes:** resvg's SVG subset covers our output — unvalidated; fonts are
  resolvable at raster time — unvalidated (couples with Custom fonts below).
- **Open questions:** resvg binding (resvg-js napi vs wasm vs CLI); ffmpeg
  as system binary vs bundled.
- **Links:** spec `svg-rendering`

### Text animation helpers
- **Problem:** typewriter reveals (letter-by-letter, word-by-word) — the
  bread and butter of text animation — require manual scene gymnastics.
- **Hypothesis:** helpers layered on rich text, revealing runs progressively.
- **Confidence:** med — follows rich text.
- **Assumes:** per-unit reveal is expressible without text measurement
  (per-letter *positioning* likely isn't) — unvalidated.

### Custom fonts
- **Problem:** only platform-resolvable families work; a brand or display
  font can't be used, which caps what the output can look like.
- **Hypothesis:** a font loader that serves both render paths — FontFace in
  the browser player, font files handed to resvg for offline rasterization.
- **Confidence:** med.
- **Open questions:** one API for both paths, or per-sink config?

### Docs that let a stranger self-serve
- **Problem:** the docs site covers pacing and examples but not the full API
  surface; a quiet publish still means someone who finds it must be able to
  learn it unassisted.
- **Hypothesis:** deepen docs *after* Player v2 and export land — documenting
  APIs that are still churning is wasted work.
- **Confidence:** high.
- **Links:** spec `docs-site`

## Later

Post-release, one line each:

- **Sound** — background tracks plus code-triggered sound events; why it
  matters: videos need audio · revisit when the ffmpeg stage lands (audio is
  a muxing concern there).
- **Code blocks & code transitions** — render code, morph one snippet into
  another; why: dev-content videos are a prime use case.
- **Particles system** — first-class emitters; why: the hand-rolled particles
  example (commit `7aa8e08`) shows the demand and the current cost.
- **Layout (flexbox-like)** — arrange entities without hand-placing
  coordinates; why: composition scales past toy scenes · revisit-if: requires
  text measurement, currently a non-goal.
- **JSX for complex entities** — declare nested entity structures as JSX
  instead of constructor calls; why: complex scenes get verbose in plain code.
- **Markdown → rich text** — a helper translating markdown into rich text
  runs; why: cheapest way to author styled text · follows rich text.

## Maintenance budget

- Track Effect `4.0.0-beta.*` releases (currently pinned to beta.94) —
  publishing a library on a beta dependency is a real risk; release should
  land on stable Effect 4 or explicitly document the pin.

## Not doing

- **Announcement / adoption push at release** — quiet publish is deliberate ·
  revisit when the export pipeline has produced real videos.
- **General layout engine** — full box-model layout stays out of scope
  pre-release; whatever measurement rich text turns out to need is scoped to
  text · revisit when Layout enters Next.

## Open questions

- Rich text v1 scope: styled runs only, or also wrapping? And does it need
  real text measurement, or can SVG `<tspan>` flow carry v1? (Measurement
  would also unblock per-letter positioning for text animation helpers, and
  couples with the resvg raster path — browser and offline must measure
  identically or frames won't match.)
- Is the unscoped `effect-motion` npm name available (react pkg is scoped
  `@effect-motion/react`) — publish both unscoped-core, or scope everything?

## Changelog

- 2026-07-13: Created. Shipped before this roadmap (see `openspec/changes/archive/`):
  frame driver, tweening, springs, traits, shapes, groups, randomness,
  schedule composition, nested scenes, react player v1, docs site, simple
  Text entity. Initial bets: Player v2 + rich text now; export pipeline,
  text helpers, fonts, docs next; sound/code/particles/layout post-release.
- 2026-07-13: Added to Later: JSX for complex entities, markdown → rich text
  helper. Resolved: streaming playback needs no engine change (frames are
  already lazy; collection was a player choice) — Player v2 is player-side only.
