# Design: add-frame-render-metadata

## Context

`Frame<Entities>` ([Scene.ts:127](packages/motion/src/Scene.ts:127)) is `{ instances, root }`. Resolution exists only as per-call renderer config (`SvgConfig { width, height }`); frame rate lives in `Runner.Settings` and never reaches frame consumers. All frames are produced by one place: `runner.state` ([Runner.ts:157](packages/motion/src/Runner.ts:157)), returned from `Scene.step`.

## Goals / Non-Goals

**Goals:**
- Every frame is self-describing for rendering: `frameRate`, `width`, `height`.
- Sinks can render a frame with no external size config.

**Non-Goals:**
- Dynamic per-frame resolution changes (settings are fixed per run).
- Changing the react `Player`/`usePlayer` API — explicit props keep working as overrides.
- Coordinate transformation / scaling based on resolution.

## Decisions

1. **Resolution lives in `Runner.Settings`** as `width`/`height` with defaults `500`/`300` (matching the react Player's existing defaults). Alternative — a separate Resolution service — rejected: settings already hold `frameRate` and flow to exactly the right place.

2. **Flat fields on `Frame`** (`frameRate`, `width`, `height`), not a nested `settings` object. Consumers read `frame.width`; no reason to expose seed/maxFrames, which are run-mechanics, not render metadata.

3. **Emit in `runner.state`**, the single producer of frame objects — every path (`Scene.step`, streams, nested plays) gets the metadata for free.

4. **Sink render functions get frame metadata as a third argument** `meta: { frameRate, width, height }` in `Renderer.make`'s `config.render(entities, config, meta)`. Passing the whole `Frame` was rejected: it drags the `Entities` generic into every sink signature and invites sinks to bypass the entity-renderer traversal. Additive, so existing sinks that ignore the third param keep compiling.

5. **SVG sink configs become optional overrides**: `SvgConfig` fields optional, resolved as `config?.width ?? meta.width`. `SvgDomRenderer` keeps `target` required. Explicit config wins so the react Player (which sizes from props) is unchanged.

## Risks / Trade-offs

- [Three extra fields copied per frame] → negligible; frames already copy the whole instances record.
- [Frames from old serialized fixtures lack the fields] → none exist; tests construct frames via `runner.state`.
- [Player props can disagree with scene settings] → documented behavior: explicit renderer config always overrides frame metadata.
