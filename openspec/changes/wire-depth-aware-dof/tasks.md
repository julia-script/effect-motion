## 1. Renderer

- [x] 1.1 Replace `DofState.strengthUv` with `aperture` (world-unit lens radius)
- [x] 1.2 Browser render path: DoF pipeline when `dof.on`, built lazily; HUD overlay after it
- [x] 1.3 Node export: DoF variants of `post` / `postWithHud`, chosen per frame
- [x] 1.4 Camera docs: drop "inert", document lens radius, CoC formula, limits

## 2. Verification

- [x] 2.1 Headless Dawn tests: aperture 0 plain path, focus plane sharp, blur grows with distance from focus, HUD sharp
