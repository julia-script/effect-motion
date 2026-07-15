# ThorVG Effect API

## Why

`packages/thorvg` needs to drive ThorVG's full C-API (`_tvg_*`) from Effect, not the thin `@thorvg/webcanvas` Embind wrapper. The wrapper only exposes `TvgCanvas` (render/resize/clear) — no direct shape/scene/gradient/text/animation construction — which is why the package already reaches past it to `globalThis.__ThorVGModule`. That raw surface is a manual-lifetime, pointer-based, error-code interface: every `_new` has a matching `delete`/`del`/`unref`, out-params need malloc'd scratch, and every call returns a ThorVG result code. Those are exactly the hazards `acquireRelease` + a typed error wrapper exist to manage. Today the package has an ad-hoc `wrap`/`init`/`makeCanvas` sketch with `console.log`s and no cleanup; this change makes it a real, scoped, determinism-friendly Effect API so the effect-motion renderer sink can eventually fold frames onto ThorVG.

## What Changes

- **Module acquisition stays the globalThis steal — wrapped as a scoped service.** Investigation (recorded in design.md) confirmed the shipped `thorvg.wasm` is closure-minified: 158 required JS imports and 162 exports are all single-letter, there is no `memory` export, and no `_tvg_*`/`malloc`/`free` are exported by name. The number→name symbol map and the emscripten runtime import object live **only** inside the (un-exported) glue closure. So the wasm cannot be self-instantiated from unpkg bytes, and thorvg's emscripten factory is never exported. `TVG.init()` is the only thing that materialises a fully-named `ThorVGModule`, which it stashes on `globalThis.__ThorVGModule`. This change keeps that path but wraps it in a `Thorvg` `Context.Service` whose acquire runs `init` and whose release runs `term()` — turning a leaked global side-effect into a scoped resource. Node vs. browser differ **only** in `locateFile` (where the glue fetches the `.wasm`), not in code paths; both run the same glue.
- **Typed error wrapping over ThorVG result codes.** Keep `wrap`/`wrapPromise` (`Effect.try`/`tryPromise` → `ThorvgException`), and extend `ThorvgException` to carry the ThorVG result code + operation name (the glue's enum: Success/InvalidArguments/InsufficientCondition/FailedAllocation/MemoryCorruption/NotSupported/Unknown). A non-zero C-API return becomes a typed failure naming the offending call, per the repo's "failures are loud defects naming the offender" invariant.
- **`acquireRelease` for every `_new` lifecycle, with Option-B ownership.** ThorVG uses parent-owns-child: once a paint is `canvas_add`/`scene_add`'d, the parent frees it. Naive per-pointer finalizers would double-free. Encode ownership as a per-paint `Ref<boolean>` returned alongside the pointer (`{ ptr, owned }`): the finalizer frees (`_tvg_paint_unref(ptr, 1)` / type-specific `del`) only while `owned`, and `add(parent, child)` flips `owned = false` — transferring ownership out of the Scope. Canvas/scene roots and detached paints (duplicate, temp measuring) keep their finalizers; added children do not.
- **Scratch-memory helper.** A `withScratch(bytes)(f)` combinator wraps `_malloc`/`_free` in `acquireRelease` for out-params (aabb/obb, size getters) and packed input arrays (gradient color stops), with HEAP-view read/write helpers over `module.HEAPU8`/`HEAPF32`/etc.
- **Whole C-API wrapped uniformly.** The ~80 `_tvg_*` functions are mechanical: each becomes an Effect-returning method that `wrap`s the call and maps the result code. Constructors (`_new`) go through `acquireRelease` + ownership Ref; mutators return `Effect<void, ThorvgException>`; getters go through `withScratch`. Generated-ish from the vendored `thorvgemscripten.ts` signatures rather than hand-written one by one.
- **Replace the current `index.ts` demo** (the `console.log` sketch) with the real module surface + a single end-to-end smoke that draws one rect to a buffer with correct cleanup.

## Capabilities

### New Capabilities

- `thorvg-runtime`: acquiring the ThorVG module as a scoped Effect service, the ownership model for paints, scratch-memory handling, error-code mapping, and the wrapped C-API surface.

### Modified Capabilities

<!-- none -->

## Impact

- `packages/thorvg/src/`: rewrite `ThorvgWasm.ts` (service + wrap + init/term), `ThorvgWasmNode.ts` (Node `locateFile` layer), a new browser `locateFile` layer, extend `ThorvgException.ts`, replace `index.ts`, and add the wrapped C-API module. `thorvgemscripten.ts` (the vendored type surface) is the source of truth for signatures and is unchanged.
- No new runtime dependency: still rides `@thorvg/webcanvas` for `init`/glue (the symbol map). The `.pnpm` patch already present stays as-is.
- **Determinism note:** ThorVG's own `FinalizationRegistry` frees its wrapper *objects* on GC. This API touches **only raw `number` pointers** and never constructs webcanvas wrapper classes, so the registry never sees our pointers and cannot race the Scope. A branded `Ptr` type keeps the two worlds from mixing. `ponytail:` comment records this boundary.
- **Deferred (`ponytail:` upgrade path), not in scope:** building thorvg from source with named exports, or vendoring the glue source to export its factory — either would remove the globalThis steal but adds an emscripten build pipeline. Deferred until the steal causes a concrete problem (multiple engine instances / worker isolation); a single init side-effect does not justify the maintenance tax today.
