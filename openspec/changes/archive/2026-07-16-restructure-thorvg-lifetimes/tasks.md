# Tasks: restructure-thorvg-lifetimes

## 1. Spike: verify the keeper-canvas hypothesis

- [x] 1.1 Write a vitest in `packages/thorvg` that: acquires the engine, creates a keeper `TvgCanvas`, creates canvas A, loads a font, deletes A, creates canvas B, renders text in that font — assert glyphs render (non-blank pixels where text should be). If it fails, record the result in design.md and switch D1 to the fallback (per-size cache behind the session API) before proceeding. *(Passed — plus a control test proving fonts ARE wiped without a keeper.)*
- [x] 1.2 In the same spike, verify `canvas.resize` within one canvas renders identically to a fresh canvas at the new size (SW renderer target reallocation). *(Passed — buffers byte-identical.)*

## 2. Module restructure (moves, no behavior change)

- [x] 2.1 Create `Interop.ts` (Ptr, Scratch, withScratch, cstr/withCstr, wrap, wrapPromise, checked, checkedPtr, acquirePaint, OwnedPaint, freePaint) — extracted from `ThorvgWasm.ts`/`api.ts`.
- [x] 2.2 Create `Engine.ts`: module service, init/global-steal, browser + node layer constructors (absorb `ThorvgWasmBrowser.ts`/`ThorvgWasmNode.ts` layer logic), still with today's release semantics for now.
- [x] 2.3 Split `api.ts` into `Canvas.ts`, `Paint.ts`, `Shape.ts`, `Scene.ts`, `Text.ts`, `Gradient.ts`, `Animation.ts` (pure moves; keep `getSharedCanvas` temporarily).
- [x] 2.4 Rewrite `index.ts`/`node.ts` as namespace re-exports (`export * as Shape …`), preserving the browser-safe/node split; delete `api.ts`.
- [x] 2.5 Update all consumer imports (`packages/motion` Renderer + render/*, exporters, `packages/react` Player, thorvg tests); `pnpm check && pnpm test` green. *(Done — zero new failures; motion/export had pre-existing failures unrelated to thorvg: stale `Schedule.both` API in motion tests, removed `effect-motion/render-node` import in export.)*

## 3. Engine tier

- [x] 3.1 Implement D2 in `Engine.ts`: idempotent singleton acquire; browser release no-op; Node release `term()`; keeper canvas created on acquire (deleted before Node `term()`).
- [x] 3.2 Delete the engine-acquire-time `fonts` option plumbing that is superseded by sessions, keeping the `sans-serif` default load working (default stays an engine-acquire concern per D4). *(Resolved: the `fonts` option IS the default-font concern (kept per D4); the piece superseded by sessions is `loadIntoEngine` (zero callers), deleted in 4.2.)*
- [x] 3.3 Tests: browser-style double-acquire shares one module; Node scope close terms; keeper keeps fonts alive across canvas churn (promote the spike into a real test).

## 4. Font registry

- [x] 4.1 Implement `Font.ts` per D4: per-module WeakMap refcount registry, scoped acquire/release, unload at zero, conflict → `ThorvgException` naming family + both sources, magic-byte format sniff (`OTTO` → otf) with override, failed load = logged skip.
- [x] 4.2 Migrate/absorb `loadFontsIntoEngine` + `loadedByModule` from `ThorvgWasm.ts`; delete the old code.
- [x] 4.3 Tests: dedup (two acquires, one load), unload-at-zero, earlier-release-keeps-loaded, conflict failure, otf sniffing, 404 skip. *(Probe finding: the wasm cannot unload data-loaded fonts (rc 5 NotSupported) — unload-at-zero became best-effort + tombstone; design.md D4 and the specs were updated accordingly.)*

## 5. Sessions

- [x] 5.1 Implement `Session.ts` (D3): scoped canvas at size + scoped fonts; resize-in-place on size change; canvas deleted on close. Delete `getSharedCanvas` and the `__emCanvasCache` hack.
- [x] 5.2 Rework `Renderer.render` (motion) to take a session (or its canvas) instead of `getSharedCanvas`; update `PngExporter`/`CanvasExporter` to open a session per run. *(Render now requires the `RenderSession` service; the exporters only consume Framebuffers, so the session moved to the render callers: demo.ts, the motion test helper, and the Player.)*
- [x] 5.3 Tests: canvas freed on session close; resize path renders correctly; two concurrent sessions with different sizes; session close releases fonts.

## 6. Pictures

- [x] 6.1 Implement `Picture.ts` per D5: `load` (encoded data + mimetype), `loadRaw`, `setSize`/`getSize`, `setOrigin`; extend `thorvgemscripten.ts` typings if any picture function is missing.
- [x] 6.2 Tests: PNG renders (non-blank framebuffer), SVG loads + natural size, unsupported bytes fail loudly, detached picture freed on scope close.

## 7. Player wiring

- [x] 7.1 Move the engine layer out of the per-Player `ManagedRuntime` into one shared module-level runtime in `@effect-motion/react`; per-mount runtime layers scene context on top. *(Simplified per design D7 update: D2 makes engine acquisition an idempotent process singleton, so per-mount runtimes already share one wasm module — no separate runtime needed.)*
- [x] 7.2 Open a `RenderSession` per Player mount with `Fonts.urlMap(scene)`; readiness gates on font settlement + first frame; release on unmount. Dispose the per-mount runtime on unmount (now safe).
- [x] 7.3 Tests/manual: two players on one docs page share one engine; unmounting one leaves the other rendering; a scene with a declared custom font renders it. *(Verified in the browser: one wasm fetch + one Pacifico fetch across multiple player mounts/unmounts/SPA navigations; the custom-fonts example renders Pacifico after an unmount→dispose→remount cycle.)*

## 8. Wrap up

- [x] 8.1 `pnpm lint:fix && pnpm check && pnpm test` across the workspace; docs-site examples still render. *(No new failures; remaining reds are the pre-existing Schedule-API, particles-branding, export-package, and lint-style breakage that predates this change. Docs examples verified live in the browser.)*
- [x] 8.2 Update `packages/thorvg/README`/AGENTS notes if they reference `api.ts` or `getSharedCanvas`; sweep for stale `ponytail:` comments made obsolete (the canvas-cache one) and add new ones where the design defers (font-churn grace period).
