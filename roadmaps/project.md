# Roadmap — effect-motion

> Direction, not commitment — Now is committed; Next is planned; Later is exploration.
> Only Now items may be promised to anyone. This document changes as we learn.
> Last reviewed: 2026-07-14 (sync 2) · Review cadence: monthly

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

_The export pipeline is complete — nothing is committed for Now. The
remaining bet toward a quiet publish is the docs push; pull it into Now when
starting it. (Export-frame font fidelity — `add-text-font-fallback` — was
dropped unbuilt; revisit only if exported frames show a real fallback gap.)_

## Next

### Text animation helpers
- **Problem:** typewriter reveals (letter-by-letter, word-by-word) — the
  bread and butter of text animation — require manual scene gymnastics.
- **Hypothesis:** helpers layered on rich text, revealing runs progressively.
- **Confidence:** med — rich text v1 shipped 2026-07-13, so this is unblocked.
- **Assumes:** per-unit reveal is expressible without text measurement
  (per-letter *positioning* likely isn't) — unvalidated.

### Markdown → rich text
- **Problem:** authoring the mdast-shaped rich-text tree by hand is verbose;
  markdown is the natural authoring format for styled text.
- **Hypothesis:** a parser helper translating markdown into the mdast-subset
  tree `Shapes.Text` already accepts — rich text v1 (shipped 2026-07-13) is
  deliberately mdast-shaped, so the mapping is close to direct.
- **Confidence:** high — promoted from Later once rich text landed and made
  the target format concrete.

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
- **Per-run text styling** — color/size/font per rich-text run (v1 shipped
  only bold/italic marks); why: multi-color captions are common in motion
  graphics · deliberately cut from rich text v1.

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
- 2026-07-13: Shipped Player v2 (change `2026-07-13-player-v2`, archived):
  buffered streaming playback (infinite scenes play), metadata-driven
  viewport sizing, icon transport with loop toggle, time readout, keyboard
  shortcuts. Done-when met in full; hook API break (`totalFrames` nullable)
  had no external consumers.
- 2026-07-13 (evening sync): Shipped **Rich text v1** (change
  `add-rich-text-spans`, 17/17 tasks, ready to archive): mdast-subset tree
  (`text`/`strong`/`emphasis`, multiple paragraphs) rendered as `<tspan>`s —
  the open scope question resolved as tspan flow, no measurement. Closed as
  done; per-run color/size styling was cut and moved to Later. Shipped
  **Custom fonts** (change `2026-07-13-add-font-loading`, archived) exactly
  as hypothesized: one `Fonts` annotation serving both paths (FontFace in
  player, `fontFiles` for resvg) — open question answered: one API. Shipped
  **export stages 1–2** (change `2026-07-13-add-resvg-rasterizer`, archived);
  Video export promoted Next → Now with ffmpeg as remaining scope; both its
  assumptions validated. Markdown → rich text promoted Later → Next (mdast
  shape made it concrete). Unplanned: `backgroundColor` scene setting
  (`1e3007c`), Vercel deploy fixes (pnpm pin, allow builds) — one-offs, not
  tracked.
- 2026-07-14: Shipped **Video export stage 3 — the full pipeline**
  (change `add-ffmpeg-encoder`, archived; spec `video-encoding` synced):
  `Ffmpeg.encode` (PNG stream → ffmpeg stdin via `image2pipe`, no temp files)
  and `Video.render` (one-call scene → MP4, framerate/dimensions from frame
  metadata, fonts auto-wired, odd-dim guard, infinite-scene `frames` cap).
  **Done-when met and verified end-to-end**: a real scene rendered through
  stream → SVG → resvg → ffmpeg into a valid H.264/yuv420p MP4, frame-count
  and dimensions confirmed via ffprobe. Video export leaves Now — the v0.1
  objective's second half is done. Open question resolved: **system ffmpeg**,
  not bundled (with a `binary` override). Now is empty; the remaining pre-
  publish work is `add-text-font-fallback` (exported-frame variant fidelity,
  0/5 tasks) and the docs push.
- 2026-07-14 (sync 2): Housekeeping, no direction change. **Rich text v1**
  archived (`add-rich-text-spans`, 17/17) and its delta synced into the
  `text-entity` spec (single-line requirement removed; rich-content + tspan
  bold/italic/paragraph requirements added; specs validate 25/25).
  **Dropped `add-text-font-fallback` unbuilt** (0/5) — decided not needed for
  publish; deleted rather than archived (never shipped), git history holds the
  proposal; revisit only if exported frames show a real fallback gap. Now
  remains empty; the docs push is the only remaining pre-publish bet.
  (Also explored FFV1-in-wasm for browser export — rejected as wrong artifact,
  not roadmap-tracked.)
