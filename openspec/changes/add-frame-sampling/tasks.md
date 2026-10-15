# Tasks: add-frame-sampling

## 1. Frame selection and JSON state (packages/export)

- [x] 1.1 `Frames.parse`: indices, `s`/`ms` times, `%`, `end`, `count N`; `FrameSelectionError` naming the bad value
- [x] 1.2 `Frames.sample` over `Scene.stream`: length pass only for `%`/`end`/`count`; out-of-range and infinite-end errors
- [x] 1.3 `Frames.toJson`: frame, time, size, frame rate, camera, root, instances
- [x] 1.4 Unit tests incl. `end`, `%`, `count`, out-of-range, infinite scene, determinism, no renderer import

## 2. Stills and contact sheet (packages/export)

- [x] 2.1 Render sampled frames to PNG stills on the Node renderer
- [x] 2.2 Compose a contact-sheet PNG (near-square grid) and report tile → frame/time
- [x] 2.3 GPU tests (run unconditionally, like the renderer's own tests)

## 3. `motion frames` command (packages/cli)

- [x] 3.1 Resolve the scene key from `studio.ts`; no/unknown key lists available keys
- [x] 3.2 Flags `--at`, `--count`, `--sheet`, `--json <path|->`, output directory; print written paths / tile map
- [x] 3.3 Errors render through the CLI error path, exit non-zero

## 4. Docs and scaffold

- [ ] 4.1 Docs page for `motion frames`, included in `llms.txt`
- [ ] 4.2 Scaffolded `AGENTS.md` tells agents to use `motion frames` to check their work

## 5. Dogfood fixes

- [x] 5.1 Provide studio `layers` to stills/sheet rendering; `Stills` typed over frame resources (D8)
- [x] 5.2 CLI e2e fixture scene with a custom font and an image, run with `--sheet` and `--at`
- [x] 5.3 Default 480 px sheet tiles, `--tile-width` override (D9)
- [x] 5.4 `--range FROM..TO` / `count N FROM..TO` (D9); tails decision recorded (D7)
- [x] 5.5 Scene list shows each scene's length
- [x] 5.6 Node renderer destroys its GPU device on scope close (D10)
- [x] 5.7 Docs, template `AGENTS.md`

## 6. Verify

- [ ] 6.1 `bun run lint && bun run check && bun run test && bun run build`
- [ ] 6.2 Manual: the acceptance commands in a scaffolded project; open the sheet PNG
