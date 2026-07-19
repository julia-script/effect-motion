---
"effect-motion": patch
---

The camera is one module again: the `lookAt`/`follow`/`orbit`/`orbitTo`/`dolly`/`dollyTo` helpers and `CameraTarget` moved from the internal `CameraHelpers.ts` into `Camera.ts`, and `CameraHelpers.ts` is deleted. The public `Camera.*` namespace is unchanged — it re-exported all of these already. `Instance` gains the `AnyInstance` convenience alias used by the helper signatures.
