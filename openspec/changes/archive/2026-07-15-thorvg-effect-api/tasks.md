# Tasks: ThorVG Effect API

## 1. Errors & module service (ThorvgException.ts, ThorvgWasm.ts)

- [x] 1.1 Extend `ThorvgException` with optional `code?: number` and `operation?: string` (keep `cause`); mirror the glue's `ThorVGResultCode` enum text (Success=0 … Unknown=6) in a small code→message map
- [x] 1.2 Add `checked(op, fn)` on top of `wrap`: run the call, fail with `ThorvgException({ code, operation: op })` when the return is a non-success code; `checkedPtr(op, fn)` treats null (0) as failure (design D3)
- [x] 1.3 Turn `ThorvgWasm` into a scoped resource (`make` = `Effect.acquireRelease`; `layer` = `Layer.effect` — beta.94 has no `Layer.scoped`): `acquire` = `wrapPromise(TVG.init)` + read `__ThorVGModule`/`__THORVG_THREAD_COUNT`; `release` = `wrap(() => module.term())`; `ponytail:` comment records the globalThis steal + D5 upgrade path
- [x] 1.4 Node `locateFile` layer (`ThorvgWasmNode.ts`, resolve wasm via `import.meta.resolve`) and a browser `locateFile` layer (`ThorvgWasmBrowser.ts`, base URL); both feed the same acquire (design D1)

## 2. Pointer, ownership, scratch (helpers in ThorvgWasm.ts)

- [x] 2.1 Branded `Ptr = number & Brand<"ThorvgPtr">`; `ponytail:` comment: raw pointers only, never mix webcanvas wrapper objects (design D6)
- [x] 2.2 `acquirePaint(new, free)` → `Effect<{ ptr: Ptr, owned: Ref<boolean> }, ThorvgException, Scope>`: `acquireRelease` where the finalizer frees only while `owned` is true (design D2)
- [x] 2.3 `add(parent, child)` (`addToCanvas`/`addToScene`): run the correct `_tvg_*_add`, then set `child.owned = false`; the only exposed attach path (design D2, risk mitigation)
- [x] 2.4 `withScratch(byteLength)(use)`: `acquireRelease(_malloc, _free)`; typed read/write helpers on a `Scratch` class (`readF32`/`readU32`/`writeF32`/`writeBytes`) via `DataView`/`HEAPU8.buffer` (only HEAPU8/HEAPF32 exposed — design finding)

## 3. Wrapped C-API surface (generated-ish from thorvgemscripten.ts)

- [x] 3.1 Canvas: Embind `TvgCanvas` (acquireRelease with `.delete()`), add/update/draw/sync via `.ptr()`, resize/clear/render via the instance (design finding: canvas = Embind, not raw ptr)
- [x] 3.2 Shape: new (acquirePaint), move_to/line_to/cubic_to/close, append_rect/append_circle, fill/stroke color, stroke width, reset — all via `checked`. (stroke cap/join/fill_rule not wrapped — same mechanical pattern, add when a consumer needs them)
- [x] 3.3 Scene: new (acquirePaint), add (via `addToScene`), clear_effects, effect gaussian_blur + drop_shadow. (fill/tint/tritone effects not wrapped — same pattern, add on demand)
- [x] 3.4 Paint common: translate/rotate/scale, opacity get/set, visible set, duplicate (acquirePaint — detached), `get_aabb` via `withScratch`. (transform/clip/blend/mask/get_obb not wrapped — same pattern, add on demand)
- [x] 3.5 Picture / Text / Font / Animation / Gradient: constructors via acquirePaint (gradient/animation use their own `del` destructor); gradient `set_color_stops` packs the stop array through `withScratch`. (Text/Font/Animation mutators + `get_size`/`get_total_frame`/`get_duration` getters not wrapped — constructors + free lifecycle in place, mutators follow the shape pattern, add on demand)

## 4. Smoke & cleanup (index.ts, test)

- [x] 4.1 Replace `index.ts` demo with the real module export surface (no `console.log`)
- [x] 4.2 Smoke test (`test/smoke.test.ts`): draw a filled rect to the SW framebuffer (asserts 100×100×4 bytes); ownership Ref flips to `false` after `add` (finalizer disarmed); a detached paint stays `owned=true`; `get_aabb` reads correct bounds from scratch; gradient color-stop packing round-trips
- [x] 4.3 `pnpm --filter @effect-motion/thorvg` typecheck + test green (5/5); Biome check clean on package (one pre-existing `Function`-type warning in vendored `thorvgemscripten.ts`)
