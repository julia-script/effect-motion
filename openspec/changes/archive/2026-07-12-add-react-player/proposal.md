## Why

Scenes can currently only be viewed by hand-wiring an Effect main loop (as the playground does): run the scene, step it per display frame, and render into a DOM node. There is no reusable way to embed a scene in a React app, and no playback controls at all — no pause, no replay, no visibility into progress. A React package with a standard media-player experience makes scenes embeddable and inspectable.

## What Changes

- New workspace package `packages/react` (published name `@effect-motion/react`) depending on `effect-motion` and React.
- A `usePlayer` hook that takes a scene (plus settings like seed/frameRate/size) and exposes playback state and controls: play, pause, seek, current frame, progress, duration.
- A `<Player>` component built on the hook: renders the scene into an SVG viewport with a control bar — play/pause button and a scrubbable progress bar, like a normal video player.
- Playback is powered by pre-rendering: because scenes are deterministic (seeded randomness) and finite, all frames are collected up front via the existing `Scene.stream`, which makes pause, seek, and a determinate progress bar trivial. No changes to the `effect-motion` core.
- Playground gains nothing yet (stays on its manual loop); a follow-up can migrate it.

## Capabilities

### New Capabilities

- `react-player`: React bindings for playing scenes — the `usePlayer` hook (frame collection, playback clock, transport controls) and the `<Player>` component (SVG viewport + play/pause + progress bar UI).

### Modified Capabilities

<!-- none — the core runtime, renderers, and existing specs are untouched -->

## Impact

- New package `packages/react` (`@effect-motion/react`); adds `react` as a peer dependency of that package only.
- Monorepo: new workspace entry, turbo tasks `check`/`test` extend automatically via existing globs.
- Uses existing public APIs: `Scene.stream`/`Scene.run`/`Scene.step`, `Svg.SvgDomRenderer`, `Svg.layer`, `Svg.shapesLayer`. No core API changes.
