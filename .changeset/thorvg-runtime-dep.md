---
"effect-motion": patch
---

Declare `@effect-motion/thorvg` as a runtime dependency. `Renderer.js` imports it at runtime, but it was listed under devDependencies, so the published package failed with `ERR_MODULE_NOT_FOUND` for any consumer outside the workspace (e.g. `pnpm dlx @effect-motion/cli`).
