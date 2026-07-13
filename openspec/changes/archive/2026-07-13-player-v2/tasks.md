## 1. Streaming acquisition (usePlayer core)

- [x] 1.1 Replace `Stream.runCollect` with a scoped `Stream.toPull` consumer: pull chunks into a ref-held frame buffer, publish `bufferedFrames` to state coalesced per animation frame, close the scope on cleanup (verify under React StrictMode double-mount)
- [x] 1.2 Implement the read-ahead policy: pull while `buffered - frame < 2 * frameRate`, resume pulling as playback/seek consumes into the window; mark `status: 'ready'` at first frame
- [x] 1.3 Detect stream completion (pull halt) and resolve `totalFrames` from `null` to the final count; surface stream failure as `status: 'error'`
- [x] 1.4 Forward `width`/`height` options into `Scene.stream` settings
- [x] 1.5 Update hook API surface: add `bufferedFrames` and `loop`/`setLoop`, make `totalFrames` nullable, compute `progress` against `totalFrames ?? bufferedFrames`, clamp `seek` to the buffered range

## 2. Playback semantics

- [x] 2.1 Keep the rAF playback clock, clamping advancement to the buffered edge (playing at the live edge waits for frames rather than pausing)
- [x] 2.2 End-of-scene behavior on completed streams: pause when `loop` is off, wrap to frame 0 when `loop` is on; replay-from-last-frame on `play()`

## 3. Player component

- [x] 3.1 Viewport from metadata: stop passing size into the render config, size the viewport div from the current frame's `width`/`height` with `aspect-ratio` and `max-width: 100%`; reserve space from props pre-first-frame when given
- [x] 3.2 Rebuild the control bar: inline SVG play/pause and loop icon buttons with aria labels, styled dark control bar replacing naked browser controls
- [x] 3.3 Scrubber: max = `totalFrames ?? bufferedFrames` (live-edge model), seeking clamped to buffered
- [x] 3.4 Time readout: `m:ss / m:ss` from `frame / frameRate` when `totalFrames` is known, elapsed-only otherwise
- [x] 3.5 Keyboard shortcuts on the focusable player root: Space toggles (no page scroll), ArrowLeft/ArrowRight step ±1 frame and pause

## 4. Tests & verification

- [x] 4.1 Update `packages/react` tests for streaming semantics: ready-before-complete, infinite scene keeps playing, totalFrames resolution, seek clamping, loop wrap, unmount interruption
- [x] 4.2 Component tests: metadata-driven viewport sizing, prop overrides, keyboard shortcuts, time readout
- [x] 4.3 Grep the docs site for `usePlayer`/`<Player>` usage, verify examples still work (including one long/infinite scene demo in the browser player)
