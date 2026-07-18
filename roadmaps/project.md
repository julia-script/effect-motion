# Roadmap — effect-motion

> Direction, not commitment — Now is committed; Next is planned; Later is exploration.
> Only Now items may be promised to anyone. This document changes as we learn.
> Last reviewed: 2026-07-14 (sync 4) · Review cadence: monthly

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

### Docs that let a stranger self-serve
- **Problem:** the docs site covers pacing and examples but not the full API
  surface; a quiet publish still means someone who finds it must be able to
  learn it unassisted.
- **Confidence:** high — every churning surface has now landed (Player v2,
  export, the text/entity-tree refactor), so the API is stable to document.
- **This is the last committed item before v0.1** — both halves of the publish
  objective (install-from-registry, real-video-end-to-end) are done.
- **Links:** spec `docs-site`

_(Export-frame font fidelity — `add-text-font-fallback` — was dropped unbuilt;
revisit only if exported frames show a real fallback gap.)_

## Next

### JSX for complex entities
- **Problem:** nested entity structures get verbose as plain constructor calls;
  `instantiate(<Group><Text>Hello</Text></Group>)` is the natural authoring form.
- **Hypothesis:** JSX desugars onto the polymorphic-children instantiation the
  refactor shipped — `children: (string | Instance | Effect<Instance>)[]`, with
  the `Effect<Instance>` case (no `yield*` at the callsite) as the load-bearing
  choice that makes JSX expressible.
- **Confidence:** med — the foundation now exists and is exercised by real nested
  scenes (moon-moth, groups, tests); the children shape held up. Still not scoped;
  post-publish unless it proves cheap.
- **Assumes:** ~~children shape holds under real nested scenes~~ → validated. The
  open piece is the JSX runtime/tsconfig wiring itself.

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

## Performance

- Render cost is now instrumented: `Renderer.render` emits `Renderer.compose`
  (JS: flatten/project/sort/paint-calls, scales with object count) and
  `Renderer.raster` (SW rasterizer, scales with pixels × dpr² and DoF) tracing
  spans, and `pnpm bench` (`packages/motion/bench/render-bench.ts`) reports the
  split across a scene matrix. **Finding:** camera rotation is ~free; the real
  levers are raster resolution (player renders at device dpr — raster is dpr²),
  per-frame scene-graph rebuild, and offscreen overdraw. Ranked backlog and
  numbers live in the `render-perf-instrumentation` change (design D3/D4).

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
  `Shapes.Text` was deleted (sync 4) as a duplicate representation. Inline
  formatting and per-run styling (color/size/font per run) return as userland
  components composing plain `Text` instances, not as engine schema · revisit
  never as an engine tree; the component/JSX path is the replacement.

## Open questions

- Is the unscoped `effect-motion` npm name available (react pkg is scoped
  `@effect-motion/react`) — publish both unscoped-core, or scope everything?

## Changelog

- 2026-07-14 (sync 4): **Shipped the refactor synced-3 had only proposed.**
  **One representation for the entity tree** — change `refactor-text-and-children`
  (archived `2026-07-14-refactor-text-and-children`, 29/29 tasks; 6 delta specs
  synced, 28 specs valid). Landed: polymorphic `children` instantiation
  (`string | Instance | Effect<Instance>`), builtin `$visible` instance prop
  (`$`-namespace reserved), `Text` as a plain-string leaf, rich text + reveal
  removed, and an HTML-style node model (`Scene.appendChild`/`removeChild`, O(1)
  parent tracking) that replaced the `parent` instantiation arg — a gap the
  implementation surfaced and resolved (design D4a). AGENTS.md gained the "engine
  renders, it does not parse" principle. Leaves Now — the JSX Next item is now
  de-risked (its children shape shipped and is exercised by real scenes; its one
  remaining unknown is the JSX runtime wiring). **Unplanned but shipped:** bundled
  ffmpeg via `ffmpeg-static` (commit `216781d`) — the *default* export binary is
  now a full build with libx264, so H.264 works with no system ffmpeg. This
  **hardened a fragile done-when**: sync-3 claimed the objective's "real video
  end-to-end" half was verified, but it only passed on a machine that happened to
  have a libx264 ffmpeg (the e2e failed locally with `Unknown encoder 'libx264'`);
  it is now portably true (export suite 16/16 incl. the e2e). GPL of the bundled
  binary noted in the export README (separate executable over a process boundary;
  source stays MIT). **Now is down to the docs push** — the last committed item
  before v0.1.
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
