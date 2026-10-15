# Verification

- `bun install --frozen-lockfile`: passed; lockfile unchanged.
- `bun run --cwd packages/motion test`: 35 files, 353 tests passed.
- `bun run --cwd packages/renderer test`: 13 files, 143 tests passed, including the existing Node GPU suites.
- `bunx turbo run build --filter='docs^...'`: all six dependency packages built.
- `bunx turbo run check --filter=effect-motion --filter=@effect-motion/renderer --filter=docs`: passed, including docs route generation and example compilation.
- Focused Biome checks on all nine changed/new TypeScript and JSON files and `git diff --check`: passed.
- `openspec validate add-rounded-rectangles --strict`: passed.

## Independent review

One independent agent reviewed all tracked and untracked changes against the contract and found no blocking defects. Its additional read-only probe covered 175 signed, collapsed, sharp, near-zero-radius, rounded, pill, and circle cases: triangulated area matched contour area, vertices stayed finite, and contours remained bounded by 68 points.

The reviewer identified a nonblocking evidence gap: the original trim/dash composition assertion selected only a straight edge. Added actual occupancy raycasts on a shifted circular quarter-contour, distinguishing a painted dash, a dash gap, and a point outside the trim window. The focused stroke suite and renderer typecheck were rerun after that addition. No production fix was necessary.

## Visual evidence

Ran `bun packages/renderer/test/support/render-evidence.ts apps/docs/examples/rounded-rectangles.scene.ts tmp/rounded-rectangles` through the scoped Node GPU adapter at 10 fps. All 51 frames rendered at 800×480 with DPR 1 and 4 output samples. Inspected frame 0 (sharp box), frame 25 (rounded intermediate), frame 50 (pill), and a fresh-renderer final frame. Fill and border remain aligned; the animated dashed outline follows the contour; the retained and fresh final frames look alike. No pixel or byte equality test was used.

Local, ignored artifacts: `tmp/rounded-rectangles/frame-{0,25,50}.png`, `fresh-last.png`, `pipeline.json`, `timing.json`, and stroke mask PNGs. The rendering loop took approximately 1.2 seconds on this machine; this is an observation, not a performance guarantee.

Browser WebGPU visual parity was not tested in this task. The preceding Path work reported an unavailable preview GPU adapter and a WebGL2 fallback with absent planar strokes; this change does not establish a fix or parity for that environment.
