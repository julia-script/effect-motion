---
"effect-motion": minor
"@effect-motion/react": minor
"@effect-motion/export": minor
"@effect-motion/thorvg": minor
---

Typed resource loaders: fonts and images are scene requirements, not annotations.

**BREAKING (pre-1.0 minor):** `Scene.annotate`/`annotateMerge`/`annotations` and the `Fonts`/`Images` annotation modules are removed. Assets are declared in the scene itself: `const Roboto = Font.Font("Roboto")` (or `Image.Image("logo")`), `yield*` the constant for the value entity props store — this puts `FontLoader<"Roboto">` into the scene's type, frames carry it as `Frame<Resources>`, and `Renderer.render` (and the Player) will not compile until a covering layer is provided. `Scene.run`/`stream` stay loader-free: frames are pure of resource bytes; only rendering consumes them.

Provide bytes with `Font.layer(Roboto, loadEffect)` / `Image.layer(...)` — loads run once at layer construction (compose retries on the load effect; `Resource.fetchBytes(url)` is the common browser loader). The Player takes them via a new `renderLayers` prop, conditionally REQUIRED: `PlayerProps<S>` forbids it for loader-free scenes and demands `Layer<Scene.Resources<S>>` otherwise. Player failures (engine, loader loads) now render a visible error panel.

More breaking changes: `Text.fontFamily` and `Shapes.Image.image` hold resource references (`{ _tag, id }`), never bare strings; the engine's implicit `DEFAULT_FONT_URL` auto-fetch is gone (`@effect-motion/thorvg` engine acquire loads nothing) — the built-in default font lives under the RESERVED id `"sans-serif"`, is the `fontFamily` schema default, and is auto-provided by the render path (provide your own loader under that id to override it). A resource referenced at render with no loader in context is a loud defect naming the id — the silent glyph fallback and image soft-skip are removed. `@effect-motion/thorvg`'s `Session` no longer takes `fonts`/`images` URL maps; pictures register lazily from loader bytes via `registerPicture` (decode-once per session). `Video.render` threads the scene's loaders to the caller (`Resource.ExtractLoaders`), so Node export paths can read font/image bytes straight from disk.
