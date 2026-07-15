# Design: ThorVG Effect API

## Context

`@effect-motion/thorvg` wraps ThorVG (a lightweight vector graphics engine compiled to wasm) so effect-motion can render frames through it. The official `@thorvg/webcanvas` package exposes an Embind `TvgCanvas` class with only `render`/`resize`/`clear`/`size`/`error` — it hides the full C-API (shapes, scenes, gradients, text, animation, scene effects) that effect-motion's shape set needs. The package already works around this by grabbing `globalThis.__ThorVGModule` after `TVG.init()`. This change turns that ad-hoc access into a scoped, typed Effect API. It is a wrapping layer; it does not build or fork ThorVG.

## Investigation: why the wasm cannot be self-instantiated

The tempting design — fetch `thorvg.wasm` from unpkg (or base64-embed it like Yoga), instantiate it ourselves with `WebAssembly.instantiate`, type it from the upstream `emscripten.d.ts`, and drop `@thorvg/webcanvas` entirely — was investigated and **rejected on evidence**:

- `WebAssembly.Module.imports(thorvg.wasm)` → **158 required imports** in a single module `"a"`, all single-letter (`a`, `b`, … `N`). These are emscripten's runtime (memcpy, syscalls, `abort`, table ops). The name→function mapping exists only inside the minified glue closure.
- `WebAssembly.Module.exports(thorvg.wasm)` → **162 exports, all single-letter**. `_tvg_shape_new` is exported as e.g. `"q"`. The symbol→number map exists only in the glue.
- **No `memory` export** — memory is glue-managed, so HEAP views can't be built without the glue.
- The shipped `webcanvas.esm.js` exports only `init`, `default`, and wrapper classes (`Canvas`, `Shape`, …). The emscripten **factory is a closure-internal local, never exported.** The upstream repo's `dist/thorvg.js`/`thorvg.d.ts` (the named factory + types) are deliberately excluded from the published `files`.

Conclusion: the glue *is* the symbol table and runtime; the wasm is meaningless without it, and the glue won't hand us its factory. `TVG.init()` is the only supported way to get a fully-named `ThorVGModule`. The globalThis steal is therefore **load-bearing, not incidental** — it is the seam through which the named module escapes.

## Live-module findings (verified against the stolen `__ThorVGModule`, v1.0.8)

Probed the real module before implementing (the vendored `thorvgemscripten.ts` is a type surface, not ground truth):

- **122 `_tvg_*` functions** present (more than the ~80 typed), plus `_malloc`/`_free`, `addFunction`/`removeFunction`, and the Embind `TvgCanvas` class.
- **Only `HEAPU8` and `HEAPF32` are exposed** as module heap views — no `HEAPU32`/`HEAP32`, and no `getValue`/`setValue`/`UTF8ToString` helpers. Consequence: `withScratch` builds typed views (`Uint32Array`, `Float32Array`, `DataView`) directly over `module.HEAPU8.buffer` at the scratch offset rather than assuming a heap view exists. String marshalling (font/text names, mimetypes) is hand-rolled UTF-8 into scratch via `HEAPU8` (D4 extended).
- **Canvas = the Embind `TvgCanvas` instance, not a raw `_tvg_swcanvas_create` pointer.** `new module.TvgCanvas("sw", "", w, h)` yields an object with `error/resize/clear/render/size/ptr` and a `delete()`; `ptr()` returns the real canvas pointer that the raw `_tvg_canvas_add`/`_draw`/`_sync` functions accept. This gives us the SW framebuffer via `render()` (which the raw C-API doesn't surface cleanly) while still letting raw paints be added by pointer. So the canvas resource is `acquireRelease(new TvgCanvas, c => c.delete())`; everything added into it is raw C-API. (`_tvg_swcanvas_create`/`_glcanvas_create`/`_wgcanvas_create` also exist and remain the D5 path if we ever drop Embind entirely.)
- `__THORVG_THREAD_COUNT` is unset in Node SW; `threadCount` defaults to 1 (existing behavior).

## Goals / Non-Goals

**Goals:**
- Module acquisition as a scoped Effect resource: `init` on acquire, `term()` on release; no leaked global.
- Every `_tvg_*_new` paired with `acquireRelease`; no manual `delete` in user code.
- Ownership transfer on `add` so parent-owned children are not double-freed (Option B).
- Typed failures carrying ThorVG result code + operation name.
- Scratch memory (`_malloc`/`_free`) scoped for out-params and packed arrays.
- One code path for Node and browser; only `locateFile` differs.
- Raw pointers only — never touch webcanvas wrapper objects (avoid the FinalizationRegistry race).

**Non-Goals:**
- Building ThorVG from source or vendoring the glue to export its factory (deferred — see D5).
- Removing the `@thorvg/webcanvas` dependency (it provides the glue/symbol map).
- Mapping ThorVG paints onto effect-motion's `shapes/` sink (separate change — this is the runtime layer only).
- Multi-threaded / worker-isolated engines (single module per layer for now).
- Wrapping features effect-motion won't use soon is fine to include (mechanical) but not required to validate the model.

## Decisions

### D1: Module as a `Context.Service` with acquire=init / release=term

`Thorvg` service holds `{ module: ThorVGModule, renderer, threadCount }`. The layer's `acquire` calls `wrapPromise(() => TVG.init(options))`, then reads `globalThis.__ThorVGModule` / `__THORVG_THREAD_COUNT` (as the current `init` already does) into the service value. `release` calls `module.term()` (the glue clears the global on term). This converts today's fire-and-forget `init` into a `Layer.scoped` resource. Two thin layers supply `options.locateFile`: Node resolves the `.wasm` via `import.meta.resolve("@thorvg/webcanvas")`; browser points at a URL (bundler asset or unpkg). Nothing else differs between them.

**Single-engine caveat (`ponytail:`):** `__ThorVGModule` is one global. Two concurrent `init`s race on it. Scope is one engine per process for now; multiple concurrent engines is the trigger for D5.

### D2: Option-B ownership via a per-paint `Ref<boolean>`

`acquireRelease` for a paint returns `{ ptr: Ptr, owned: Ref<boolean> }`. The release finalizer reads `owned`; if still `true`, it frees (`_tvg_paint_unref(ptr, 1)`, or the type's `_del` for animation/gradient/accessor). `add(parent, child)` runs `_tvg_canvas_add`/`_tvg_scene_add` and then sets `child.owned = false`, transferring the free to the parent's subtree destruction.

Why a Ref and not a child Scope per paint: a frame-exact renderer draws thousands of paints per frame; a `Scope` allocation per rectangle is real overhead, and Effect's ambient `Scope.addFinalizer` returns no cancel handle to disarm cheaply. A boolean Ref is O(1), composes with the uniform generated wrappers, and still frees genuinely-detached paints (`duplicate`, temp measuring) that never get added — which a "finalize roots only" scheme would leak.

Alternatives rejected:
- *Scope owns everything (Option A):* `ref`/`unref` bookkeeping or remove-before-delete to stop ThorVG freeing children — fights ThorVG's own ownership, more calls per frame.
- *Child Scope per paint:* textbook-correct, too heavy (see above).
- *Finalize roots only:* leaks detached paints.

### D3: Result-code mapping in `wrap`

The C-API returns `0` on success and a small enum otherwise. A `checked(op, fn)` helper runs the call and, if the return is non-zero, fails with `ThorvgException({ code, operation: op })`. `ThorvgException` gains `code?: number` and `operation?: string` alongside `cause`. The enum text mirrors the glue's own `ThorVGResultCode` (Success=0 … Unknown=6). Constructors that return a pointer treat `0` (null) as failure; mutators/getters treat non-zero as failure. This satisfies "failures are loud defects naming the offender."

### D4: `withScratch` for malloc'd memory

`withScratch(byteLength)(use)` = `acquireRelease(_malloc(byteLength), p => _free(p))` then `use(ptr)`. Read/write helpers index the right HEAP view (`HEAPF32` for float out-params like aabb, `HEAPU32` for counts, `HEAPU8` for byte packing) at `ptr >> shift`. Used by: `_tvg_paint_get_aabb`/`get_obb`, `_tvg_picture_get_size`, gradient `set_color_stops` (pack an array of stops), and any `*Ptr` out-param in the signatures. Because it's `acquireRelease`, an interrupted getter still frees its scratch.

### D5: Deferred — own the factory (removes the steal)

If/when the globalThis steal becomes a real constraint (concurrent engines, worker isolation, SSR determinism), the upgrade is to stop riding `TVG.init`: either (a) vendor thorvg.web's glue *source* and re-export its emscripten factory, calling `factory({ wasmBinary })` for true bytes-in acquisition, or (b) build thorvg from source with `-sEXPORTED_FUNCTIONS` named exports and instantiate directly. Both add an emscripten build/vendoring pipeline. Marked with a `ponytail:` comment at the service acquire site: *"globalThis steal; own the factory (D5) if concurrent engines are needed."* Not built now — a single init side-effect doesn't justify the maintenance tax, and the repo deliberately minimises moving parts (see the pinned `effect` beta).

### D6: Branded `Ptr` + no wrapper objects (FinalizationRegistry boundary)

webcanvas's wrapper classes register with a `FinalizationRegistry` that frees the underlying paint when the *JS object* is GC'd. Our API returns raw `number` pointers and never constructs those wrappers, so the registry never sees our pointers — no GC-vs-Scope double-free. Encode the pointer as a branded `type Ptr = number & Brand<"ThorvgPtr">` so a stray webcanvas object can't be passed where a `Ptr` is expected. A `ponytail:` comment states the invariant: *raw pointers only; do not mix webcanvas wrapper objects into the tree.*

## Risks

- **The glue's global-set behavior is undocumented internal API.** `__ThorVGModule` could change name/shape across `@thorvg/webcanvas` versions. Mitigation: version is pinned (`^1.0.8`) and the `.pnpm` patch already targets a specific build; a failed steal is a loud defect at acquire, not a silent wrong render.
- **`term()` semantics under a shared global:** if two scopes acquire/release out of order, one `term()` could tear down a module another scope still holds. Single-engine scope (D1) sidesteps this until D5.
- **Ownership Ref discipline:** every path that hands a paint to a parent must go through `add` (the only place that flips `owned`). A raw `_tvg_scene_add` call that bypasses `add` reintroduces the double-free. Mitigation: `add` is the only exposed way to attach; the low-level `_tvg_*_add` stays internal.

## Migration

Greenfield package (version `0.0.0`, current `index.ts` is a throwaway demo). No consumers yet, so no migration — the demo is replaced by the real surface + one smoke test.
