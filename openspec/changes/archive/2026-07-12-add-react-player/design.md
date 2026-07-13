## Context

The core library exposes an externally paced scene runtime: `Scene.run` returns a `RunningScene`, `Scene.step` advances one frame per call, and `Scene.stream` wraps that as a `Stream<Frame>` that ends when the scene completes. Frames are plain data (`{ instances, root }`) and `Svg.SvgDomRenderer` materializes a frame into any `HTMLElement` given `Svg.layer` + `Svg.shapesLayer`. Scenes are deterministic: seeded randomness (`Runner.defaultSeed`) makes a scene byte-identical across runs, and scenes are finite (the generator returns).

The playground drives this loop manually with rAF and Effect plumbing. React users have nothing.

## Goals / Non-Goals

**Goals:**
- `@effect-motion/react` package in `packages/react`.
- `usePlayer(scene, options)` hook: playback state (playing, frame index, total frames, progress) and controls (play, pause, toggle, seek).
- `<Player>` component: SVG viewport + play/pause button + scrubbable, determinate progress bar.
- Zero changes to `effect-motion` core.

**Non-Goals:**
- Live/infinite scenes (frame collection assumes the scene ends). Streaming playback of unbounded scenes is a later change.
- React reconciliation of SVG (we reuse `SvgDomRenderer` into a ref'd div; React never diffs the SVG).
- Volume/fullscreen/keyboard shortcuts, playback-rate control, SSR rendering of frames.
- Migrating the playground.

## Decisions

**1. Pre-render all frames, then play back an array.**
`usePlayer` runs `Scene.stream(scene, settings) |> Stream.runCollect` once (in an effect started on mount / when inputs change) and stores `Frame[]`. Playback is then just an index into that array advanced by rAF at the scene's frameRate.
- Why: determinism + finiteness make this correct, and it buys pause/seek/duration for free — seeking backwards is impossible against a live generator (the Phaser only advances). A "normal player" progress bar needs a known duration, which only exists after completion.
- Alternative considered: live stepping with a frame cache filled as it plays (play immediately, duration unknown until first completion). More states, no scrubbing ahead, indeterminate progress bar. Add later only if long scenes make upfront collection feel slow.

**2. Render frames with the existing `SvgDomRenderer` into a ref'd container.**
The component holds a `<div ref>`; an effect renders `frames[index]` via `renderer.render(frame, { target, width, height })` whenever the index changes.
- Why: reuses the tested sink, keeps React out of SVG diffing. Clear-and-rebuild per frame is the sink's documented trade-off already.
- Alternative: map `SvgNode` vnodes to React elements (`createElement(tag, props)`); pure-React tree, but duplicates the DOM sink for no user-visible gain.

**3. One Effect run per collection, plain React state for playback.**
Effect is used only to collect frames (one `Effect.runPromise` with `Svg.layer`/`shapesLayer` provided, cancelled via fiber interruption on unmount/re-run). The playback clock is a plain rAF loop in the hook — no Effect at 60fps in React land.
- Why: the collection is inherently effectful; the clock isn't. Mixing Effect into the per-frame path adds runtime cost and conceptual weight with no benefit.

**4. Hook owns logic, component owns chrome.**
`<Player>` is a thin styled shell over `usePlayer` (viewport div, play/pause button, `<input type="range">` as the progress bar). Users with custom UI use the hook directly.
- Why: the "maybe from a hook" instinct is right — controls UI is the replaceable part. Native range input gives scrubbing, keyboard, and a11y for free; no slider dependency.

**5. Package shape mirrors `effect-motion`.**
`packages/react`, name `@effect-motion/react`, ships TS source via `exports` like the core package, `react` (>=18) as peer dependency, `effect-motion` as workspace dependency. Tests run in vitest with happy-dom.

## Risks / Trade-offs

- [Upfront collection blocks first paint for long scenes] → frames are plain JS objects and collection runs the scene as fast as the CPU allows (no wall-clock waits — the phaser is externally paced). Expose a `status: 'loading' | 'ready' | ...` so the UI can show it. Revisit with streaming playback if real scenes get slow.
- [Memory: full frame list retained] → frames share instance data structurally where the runner didn't touch them; acceptable for the target use (short vignettes). Documented ceiling.
- [Scene errors surface asynchronously during collection] → hook exposes `status: 'error'` with the error value rather than throwing mid-render.
- [`exports` maps to `.ts` source, so consumers need a TS-aware bundler] → same constraint the core package already imposes; acceptable for now, revisit when publishing.

## Open Questions

- None blocking. Playback-rate and loop props are trivial follow-ups if wanted.
