# Roadmap — effect-motion

> Direction, not commitment — Now is committed; Next is planned; Later is exploration.
> Only Now items may be promised to anyone. This document changes as we learn.
> Last reviewed: 2026-07-14 (sync 3) · Review cadence: monthly

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

### One representation for the entity tree
- **Problem:** the engine carries two tree spines — instances via `Group.children`,
  and a *second* rich-text tree buried inside `Shapes.Text`'s data. The duplicate
  blocks a future component/JSX layer and pins text preprocessing on the per-frame
  path where it can't be memoized.
- **Solution:** children-defining instantiation (`instantiate(Group, { children: [...] })`
  accepting `string | Instance | Effect<Instance>`), a builtin `$visible` instance
  prop, `Text` as a plain-string leaf, and the removal of rich text + reveal. One
  tree, styling as ordinary entity data.
- **Why now:** breaking changes are free pre-publish and expensive after; this is
  the last window to fix the shape.
- **Confidence:** high — shaped and specced; mostly deletion plus one normalization step.
- **Links:** change `refactor-text-and-children` (proposed, 0/~9 task groups)

### Docs that let a stranger self-serve
- **Problem:** the docs site covers pacing and examples but not the full API
  surface; a quiet publish still means someone who finds it must be able to
  learn it unassisted.
- **Confidence:** high — the churning surfaces (Player v2, export) have landed;
  the text surface settles once the refactor above applies.
- **Links:** spec `docs-site`

_(Export-frame font fidelity — `add-text-font-fallback` — was dropped unbuilt;
revisit only if exported frames show a real fallback gap.)_

## Next

### JSX for complex entities
- **Problem:** nested entity structures get verbose as plain constructor calls;
  `instantiate(<Group><Text>Hello</Text></Group>)` is the natural authoring form.
- **Hypothesis:** JSX desugars onto the polymorphic-children instantiation the
  `refactor-text-and-children` change introduces — accepting `Effect<Instance>`
  children (no `yield*` at the callsite) is the load-bearing choice that makes
  it expressible.
- **Confidence:** med — de-risked by the refactor (the shape is designed for it),
  but not scoped; post-publish unless it proves cheap.
- **Assumes:** the children shape holds up under real nested scenes — to validate
  once the refactor lands.

### Text rethink (post-component)
- **Problem:** text animation (typewriter/reveal) and markdown authoring are real
  needs, but the rich-text-tree approach that backed them is being deleted as a
  duplicate representation.
- **Hypothesis:** rebuild them on the component/JSX foundation instead — reveal as
  lazy/reactive instances (functions of scene state, re-evaluated per frame),
  markdown as a *userland* builder emitting `Group`/`Text` instances (reusing
  existing markdown libs, memoizable outside the scene).
- **Confidence:** low — direction chosen, no solution shaped; explicitly deferred.
- **Assumes:** per-unit reveal is expressible without text measurement
  (per-letter *positioning* likely isn't) — carried over, still unvalidated.

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
- **Rich text as an in-engine tree** — the mdast-shaped content tree inside
  `Shapes.Text` is being deleted as a duplicate representation. Inline
  formatting and per-run styling (color/size/font per run) return as userland
  components composing plain `Text` instances, not as engine schema · revisit
  never as an engine tree; the component/JSX path is the replacement.

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
- 2026-07-14 (sync 3): **Text direction pivot.** An explore session concluded
  rich text is a duplicate tree representation (a second spine beside the
  id-based entity tree) that blocks a future component/JSX layer and pins
  preprocessing on the per-frame path. New change **`refactor-text-and-children`**
  proposed (proposal/design/specs/tasks written, validates; not yet applied):
  polymorphic `children` instantiation (`string | Instance | Effect<Instance>`),
  builtin `$visible` instance prop, `Text` as a plain-string leaf, and removal of
  rich text + reveal. Consequences: **`add-text-reveal`** shipped the Next item
  *Text animation helpers* (12/12, `Motion.reveal` + `segment`/`prefix`) but is
  now **superseded** — the refactor deletes it (archive-then-revert planned so
  history stays honest); text animation reframed onto lazy/reactive instances,
  post-component. *Markdown → rich text* dropped from Next → reframed as a
  **userland** builder (reuse markdown libs, memoizable), folded into a new
  *Text rethink (post-component)* Next item. *Per-run text styling* and the
  rich-text engine tree moved to **Not doing** (premise deleted). **JSX**
  promoted Later → Next (de-risked: the children shape is designed for it). The
  refactor enters **Now** as a committed pre-publish bet; docs push pulled into
  Now alongside it. New principle to record in AGENTS.md: *the engine renders,
  it does not parse* — push preprocessing to userland.
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
