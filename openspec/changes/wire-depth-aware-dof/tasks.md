## 1. Renderer

- [x] 1.1 Replace `DofState.strengthUv` with `aperture` (world-unit lens radius)
- [x] 1.2 Browser render path: DoF pipeline when `dof.on`, built lazily; HUD composited over the DoF output inside the pipeline (a second canvas render would present three's stale internal framebuffer over it)
- [x] 1.3 Node export: DoF variants of `post` / `postWithHud`, chosen per frame
- [x] 1.4 Camera docs: drop "inert", document lens radius, CoC formula, limits

## 2. Verification

- [x] 2.1 Headless Dawn tests: aperture 0 plain path, focus plane sharp, blur grows with distance from focus, HUD sharp

## 3. Docs

- [x] 3.1 DoF examples (rack focus, tilted plane, focus orbit) and a camera depth-of-field guide
