## Why

The current player was built for debugging and it shows: it collects *all* frames before playing (long scenes start slowly, infinite scenes never start), it ignores the resolution metadata frames now carry (hardcoded 500×300 defaults, aspect ratio ignored), and its transport is bare browser controls with ASCII glyphs. This is the top "Now" item on the roadmap, and the engine-side groundwork (frame metadata, lazy frame production) is already done — the remaining work is entirely player-side.

## What Changes

- `usePlayer` switches from collect-then-play to **buffered streaming**: frames are pulled from the scene stream as playback needs them (with a small read-ahead buffer), so playback starts near-instantly and infinite scenes play indefinitely.
- `totalFrames` becomes unknown until the stream completes — **BREAKING** for the hook API: consumers get a buffered-frame count plus a completion flag; progress is determinate only once the stream ends.
- Scrubbing is clamped to the buffered range (live-edge model); backward seek stays free since played frames are retained.
- `usePlayer` forwards `width`/`height` into the runner settings, and the `<Player>` viewport sizes itself from frame metadata instead of hardcoded props — aspect ratio is respected by construction. Explicit `width`/`height` props remain as overrides.
- Transport UI is rebuilt: SVG icons (play/pause/loop), a loop toggle, a time readout (`0:03 / 0:10`, from frame rate), keyboard shortcuts (space = toggle, arrow keys = frame step), and a styled, self-contained control bar replacing naked browser controls.
- Out of scope: playback speed, fullscreen, volume, engine changes of any kind.

## Capabilities

### New Capabilities

None — this reshapes the existing player capability.

### Modified Capabilities

- `react-player`: frame acquisition changes from run-to-completion collection to buffered streaming (loading/ready semantics, totalFrames nullability, seek clamping); viewport sizing changes from fixed props to frame-metadata-driven with prop overrides; transport requirements gain loop toggle, time readout, keyboard shortcuts, and icon buttons.

## Impact

- `packages/react/src/usePlayer.ts` — core rewrite of the frame acquisition effect (Stream pull instead of `Stream.runCollect`); hook API shape changes.
- `packages/react/src/Player.tsx` — viewport sizing from metadata; new transport UI.
- `packages/react/test/` — playback tests updated for streaming semantics.
- Docs site examples that embed `<Player>` — should keep working (props become optional overrides), verify.
- No changes to `packages/motion` — frame metadata and lazy streaming already exist.
