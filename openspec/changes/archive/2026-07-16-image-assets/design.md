# Design: image-assets

## Context

Built directly on restructure-thorvg-lifetimes (archived 2026-07-16): the engine keeper makes session-scoped resources safe; `RenderSession` already bundles canvas + fonts; `Picture.ts` wraps decode/size/origin; the fonts pipeline established the annotation → session-load → paint-by-name-with-soft-skip pattern and the determinism precedent ("rendered output may depend on loaded assets; frame data never does").

Known engine facts that shape this design:

- Pictures are paints, not entries in a global table (unlike fonts) — a session can own them outright and release them on close. None of the font registry's refcount/conflict/tombstone machinery applies.
- Text under a nested scene ignores `set_transform` (verified quirk, worked around in the text paint fn). Whether pictures share this quirk is **unverified** and is the main spike question.
- `Tvg_Matrix` is a full 3×3; our `setTransform` hardcodes the projective row to `0,0,1`. A homography variant is the future tilt path for images.

## Goals / Non-Goals

**Goals:**

- Scene-authored images: declare by name, place/tween like any entity, render in player and exporters.
- Decode once per session; per-frame cost is a duplicate + transform, not a decode.
- Fonts-consistent failure semantics: bad URL/bytes = logged skip; missing asset at paint time = that entity paints nothing.

**Non-Goals:**

- Tilted/3D images (no orientation fields in v1; projective-transform upgrade recorded as a ceiling).
- Animated images (no GIF/APNG; Lottie-as-picture is static and not exposed).
- Cross-session byte caching (browser HTTP cache already dedups fetches).
- `src.path` file loading (reserved field, url-only — same as fonts).
- SVG-specific features beyond what `Picture.load` already does.

## Decisions

### D1: Mirror the fonts declaration model exactly

`Images.ts` in `effect-motion` is a structural copy of `Fonts.ts`: `ImageResource { name: string, src: { url?, path? } }`, a `Context.Reference` annotation key, `get(scene)`, `urlMap(scene)`. The runtime never reads it. *Alternative considered:* URL directly in entity data — one field simpler, but couples scenes to environment, and gives the session nothing to prefetch from (frame data isn't known ahead of playback). Name indirection also matches how `fontFamily` works, so authors learn one model.

### D2: Session owns decoded pictures; frames use duplicates

`Session.make` gains `images?: Record<string, string>` (name → url). At open, each entry is fetched and decoded into a picture paint held by the session scope, exposed as `pictures: ReadonlyMap<string, OwnedPaint>` on `RenderSessionShape`. Close frees them (plain scope ownership — pictures are not engine-global). Per frame, the paint fn `Paint.duplicate`s the cached picture; the duplicate joins the frame subtree and frees with it.

*Gate (spike, task 1) — **RESOLVED, both pass** (2026-07-16):* (a) duplicate shares the decoded surface — 100 duplicates of a 512×512 raw picture in 4.24 ms (~42 µs each; a 1 MiB pixel deep-copy ×100 would be orders of magnitude slower). The `_tvg_paint_ref` fallback is not needed. (b) pictures honor `set_transform` under a nested scene exactly (scale ×2 + translate lands the footprint pixel-perfectly) — the Text nested-scene quirk does NOT apply to pictures, so the paint fn uses the standard `finishPaint` projection path. Spike also re-confirmed: render tests must paint a background rect first (SW targets are malloc'd, uninitialized).

### D3: Entity surface — optional undefaulted size, billboard only

`Shapes.Image`: `image: Schema.String` (required name), position fields + `opacity` via the standard `Shape2D` lenses, `width`/`height` as `optionalKey` numbers (no defaults — a default would distort; natural size is the correct fallback and only exists post-decode). Set → drawn at exactly that size, and the fields tween like any numerics; absent → natural size. *(Implementation finding, probe-verified: ThorVG's `Picture.setSize` preserves the source aspect — an 8×8 sized to 40×20 renders 20×20 (uniform min-factor scale). Exact per-axis sizing therefore folds `declared/natural` scale factors into the projection transform instead of calling `setSize`.)* No orientation fields: absent, not ignored (a tilted Image is a type error, honest about the renderer's capability). `// ponytail: billboard only — tilt needs a projective setTransform (3×3 bottom row) mapping the projected quad; add when a scene needs a tilted image.`

### D4: Failure semantics, verbatim from fonts

Session open: a failed fetch or decode for one entry is a logged skip naming the asset and source; the session opens; other images load. Paint time: a name absent from the session map paints nothing and does not fail the frame. No conflict concept exists — sessions own their own pictures, and two sessions may load different sources under the same name without interacting.

### D5: Spec amendments are part of the change

`thorvg-images` "Picture data is paint-tier" was written before sessions could hold pictures; it is reworded (per-frame duplicates paint-tier; session MAY hold source pictures via its scope). `thorvg-runtime` "Render session bundles canvas and fonts" widens to images. Both are true modifications shipped as delta specs, not silent drift.

## Risks / Trade-offs

- [Duplicate deep-copies pixels → per-frame memcpy of large images] → Spike measures it; `ref`-based fallback specified in D2. API shape is unaffected either way.
- [Pictures share Text's nested-scene transform quirk] → Spike rules it out before the paint fn is written; text-style workaround exists if not.
- [Large image + dpr scaling looks soft (bitmap upscaled by root-scene dpr scale)] → Accepted for v1; authors control source resolution. Revisit only with evidence.
- [Session holds every declared image for its whole life even if used one frame] → Bounded by the scene's own declaration list; matches fonts. Not worth partial-load machinery.
- [`width` set without `height` (or vice versa)] → Both-or-neither enforced at the paint fn level: a lone dimension is ignored with the natural size used (simplest deterministic rule; aspect-preserving single-dimension scaling needs natural size in data, which doesn't exist there). Documented on the entity.

## Open Questions

- None blocking. The two spike outcomes (D2 gate) select between pre-specified fallbacks without changing the public surface.
