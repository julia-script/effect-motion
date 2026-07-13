## 1. Package scaffold

- [x] 1.1 Create `packages/react` with package.json (`@effect-motion/react`, exports `./src/index.ts`, deps: `effect-motion` workspace + `effect`; peer: `react >=18`; dev: react, typescript, vitest, happy-dom, @testing-library/react), tsconfig extending the base with DOM lib + `jsx: react-jsx`, and run `pnpm install`
- [x] 1.2 Verify turbo picks up the package: `pnpm check` runs `tsc --noEmit` for it

## 2. usePlayer hook

- [x] 2.1 Implement frame collection: on mount/input change, run `Scene.stream(scene, settings) |> Stream.runCollect` via `Effect.runPromise` with `Svg.layer`/`Svg.shapesLayer` provided; expose `status: 'loading' | 'ready' | 'error'`; interrupt the fiber on unmount/re-run
- [x] 2.2 Implement the playback clock: rAF loop advancing the frame index at `frameRate` while `playing`; auto-pause on the last frame; expose `frame`, `totalFrames`, `progress`
- [x] 2.3 Implement controls: `play` (restarts from 0 when on the last frame), `pause`, `toggle`, `seek(n)` clamped to `[0, totalFrames - 1]`
- [x] 2.4 Tests (vitest + happy-dom): collection reaches `ready` with frames; failing scene yields `status: 'error'`; seek clamps both ends; play-after-complete restarts; unmount during loading interrupts without state updates

## 3. Player component

- [x] 3.1 Implement the viewport: `<div ref>` that renders `frames[frame]` through `Svg.SvgDomRenderer` in an effect keyed on the frame index
- [x] 3.2 Add transport chrome: play/pause toggle button (label reflects state) and an `<input type="range">` progress bar bound to `frame`/`seek`, plus `autoPlay` prop; minimal inline styling
- [x] 3.3 Tests: first frame's SVG appears in the DOM after loading; clicking the button toggles playback state; changing the range input seeks the viewport

## 4. Wrap-up

- [x] 4.1 Export `usePlayer` and `Player` from `src/index.ts`; run `pnpm turbo run check test` and `pnpm lint` clean (new code only)
