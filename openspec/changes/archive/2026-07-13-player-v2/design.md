## Context

`usePlayer` currently runs the scene to completion with `Stream.runCollect`, then plays the array back on a rAF clock. `Player.tsx` hardcodes `width = 500, height = 300` and forces them into the render config. Meanwhile the engine already provides everything v2 needs: `Scene.stream` produces frames lazily, every `Frame` carries `{ frameRate, width, height }` (commit `048efa2`), and `SvgDomRenderer` falls back to frame metadata when config size is absent (`config.width ?? meta.width`).

All work is in `packages/react`. No engine changes.

## Goals / Non-Goals

**Goals:**
- Playback starts as soon as a small buffer is filled, not after full collection.
- Infinite scenes play indefinitely.
- Viewport size and aspect ratio come from frame metadata; props are overrides.
- Transport: icon buttons, loop toggle, time readout, keyboard shortcuts, styled control bar.

**Non-Goals:**
- Playback speed, fullscreen, audio, frame-thumbnail previews.
- Forward seek past the buffered edge (scrubber clamps to what exists).
- Any change to `packages/motion`.

## Decisions

### D1: Pull-based acquisition via `Stream.toPull`

Replace `Stream.runCollect` with `Stream.toPull(stream)` inside a scoped fiber that lives for the lifetime of the hook (per scene/seed/settings identity). A consumer loop pulls chunks and appends them to a growing frame buffer held in a ref, publishing buffer length to React state (throttled to animation frames to avoid a render per frame).

- *Why not `runForEach` + latch?* `toPull` gives demand-driven consumption directly; `runForEach` pushes at production speed, which re-creates collect-everything for fast producers.
- *Why keep all pulled frames instead of a ring buffer?* Backward scrubbing is a core feature and frames were already all-in-memory in v1. Memory-bounded windows are a later concern for very long scenes (`ponytail:` note in code).

### D2: Buffering policy — read-ahead window

Pull while `buffered - played < READ_AHEAD` (default: 2 seconds of frames, i.e. `2 * frameRate`), and always pull enough to start (`min(READ_AHEAD, stream end)`). Pulling resumes whenever playback or seeking consumes into the window. Stream end (`Pull` halt) marks the scene finite: `totalFrames` becomes known.

- Playback may start once the first frame arrives; status is `ready` at first frame, not at stream end.

### D3: Hook API — `totalFrames: number | null`

`totalFrames` is `null` until the stream completes (finite scenes complete quickly for short content; infinite scenes never do). Add `bufferedFrames: number`. `progress` stays 0..1 but is computed against `totalFrames` when known, else against `bufferedFrames` (live-edge style). This is a breaking change to the hook's shape; `<Player>` is updated in the same change, and the docs site verified.

- *Why not keep `totalFrames: number` with a `finite` flag?* `null` makes "unknown" unrepresentable-as-a-lie; a `0`-until-done number invites division bugs in consumers.

### D4: Seek semantics — clamp to buffered

`seek(n)` clamps to `[0, bufferedFrames - 1]`. Backward seek is free (frames retained). The scrubber max is `totalFrames ?? bufferedFrames`, so for in-progress/infinite scenes the bar's right edge is the live edge — the model every live player uses.

### D5: Size from metadata, props as overrides

`usePlayer` forwards `width`/`height` (when given) into `Scene.stream` settings, so the runner stamps them onto frames. `Player.tsx` stops passing size into the render config — the sink's metadata fallback takes over. The viewport div is styled from the current frame's `width`/`height` with `aspect-ratio` CSS and `max-width: 100%`, so the player scales down responsively while keeping the scene's ratio. Before the first frame, the viewport reserves space from props when given; otherwise it renders a minimal placeholder and accepts one layout settle on first frame.

### D6: Transport UI — inline SVG icons, no dependencies

Play/pause/loop icons are small inline `<svg>` paths in the component (three icons don't justify an icon library). Loop toggle wraps playback to frame 0 on completion instead of pausing (finite scenes only; infinite scenes never complete). Time readout renders `m:ss / m:ss` from `frame / frameRate`, with the total shown as the buffered edge (prefixed by nothing when final, so `0:03 / 0:10`; live edge shows just elapsed `0:03`). Keyboard: Space toggles, ArrowLeft/ArrowRight step ±1 frame (pausing playback) — bound on the player root via `tabIndex={0}`, not globally, so multiple players coexist. Controls styled as a single dark control bar; plain CSS inline styles (the package has no styling system, and one component doesn't need one).

## Risks / Trade-offs

- [Pull loop vs React StrictMode double-mount] → acquisition lives in one effect with proper scope close on cleanup; the AbortController pattern from v1 is replaced by `Scope.close`, tested under StrictMode.
- [State churn: a state update per frame pulled] → buffer lives in a ref; React state gets `bufferedFrames`/`totalFrames` updates coalesced per animation frame.
- [Unbounded memory for infinite scenes] → accepted for v2 (matches v1 behavior for finite scenes); `ponytail:` comment marks the ceiling and the ring-buffer upgrade path.
- [Docs-site examples breaking on hook API change] → `<Player>` props stay compatible (width/height become optional overrides); only direct `usePlayer` consumers see the shape change — grep docs site during implementation.

## Open Questions

None blocking — buffering constants (read-ahead size) are implementation-tunable defaults, not contracts.
