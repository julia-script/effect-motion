---
"@effect-motion/cli": minor
---

`motion frames`: sample a studio scene headlessly as PNG stills, a contact sheet (`--sheet`) or JSON state (`--json`, `-` for stdout), with `--at`, `--count`, `--range`, `--dpr` and `--tile-width`; with no scene it lists the scenes and their lengths. Also: the studio no longer boots blank (the HarfBuzz font package stays out of Vite pre-bundling), and headless renders release the GPU device so scripts exit.
