# Design

## Context

See [proposal.md](proposal.md) and [alpha-masks/spec.md](specs/alpha-masks/spec.md). On current main, the Runner owns one instance tree and emits self-contained frames. `Sync.walkTree` composes `T · R · S` and ancestor opacity, routes world and HUD into different scenes, and handles `Scene.play` groups as render-to-texture composition boundaries. A plain Group does not isolate its descendants' paint or depth. The root depth-of-field pass reads the world depth buffer; HUD and child compositions stay sharp internally. The browser and Node paths share Sync and differ in device/output adaptation.

## Goals / Non-Goals

**Goals:** Represent mask attachment as a relation between existing ids; apply projected source alpha to each target fragment while preserving its camera tier, depth, and existing Group behavior; retain expensive mask resources across frames.

**Non-Goals:** A new mask entity, a second structural tree, flattened ordinary Groups, source-depth clipping against target depth, or a new focus pass inside child compositions.

## Decisions

### D1 — Scene API and authoring

Add `Scene.setMask(target, source, { mode?: "alpha" | "inverse" })` and `Scene.clearMask(target)`. Both use `Effect.fn`, return an Effect, and take `Instance.Instance<MaskableTag>` where `MaskableTag` is the closed paintable tag union excluding `Camera`. They act immediately at the current scene frame and return the target handle, so authors can continue working with it. The `mode` default is `"alpha"`; an attachment on a target is replaced atomically. The source is an existing instance, and existing `Motion.moveTo`, `Motion.fadeTo`, `Motion.scaleTo`, `Motion.rotateTo`, and raw field tweens animate it without mask-specific animators.

```ts
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";

const reveal = Scene.make(function* () {
  const title = yield* Scene.instantiate("Text", { text: "Hello", fontSize: 96 });
  const wipe = yield* Scene.instantiate("Rect", { width: 180, height: 120 });
  yield* Scene.setMask(title, wipe);
  yield* wipe.pipe(Motion.moveTo({ x: 320 }, "1 second"));
  yield* Scene.clearMask(title);
});
```

```ts
const cutout = Scene.make(function* () {
  const art = yield* Scene.instantiate("Group", {
    children: [
      Scene.instantiate("Rect", { width: 280, height: 160 }),
      Scene.instantiate("Text", { text: "SALE", fontSize: 72 }),
    ],
  });
  const window = yield* Scene.instantiate("Circle", { radius: 60, opacity: 0.5 });
  yield* Scene.setMask(art, window, { mode: "inverse" });
  yield* window.pipe(Motion.scaleTo(2, "500 millis"));
});
```

The examples describe the proposed API; runtime code is part of later tasks. We choose explicit set/clear operations over an entity `mask` schema field: an id typed as ordinary data cannot verify a live handle, ownership, or frame-time boundary at assignment. We choose a source handle over a dedicated Mask entity so every existing paintable's shape and animation work directly.

### D2 — Frame relation and validation

The Runner stores `Map<targetId, { sourceId, mode }>` separately from the existing `InstanceTree`. `Frame.masks` serializes this as a plain record keyed by target id. It is an edge table, not structural ownership: `children` and tracked `parentId` remain the only tree, and source/target nodes are neither cloned nor reparented. The frame serializer snapshots the relation each frame; no Effect, handle, source bytes, or GPU object enters frame data. `clearMask` deletes the edge. A changed reference appears on the same scene frame, preserving the phaser's deterministic timing.

At mutation time, validate that both endpoints exist, are mounted, are paintable, belong to the same composition and render tier, and have disjoint subtrees; require that a source belongs to no other target. Also reject a reference cycle (following mask edges and descendant masks). `Scene.appendChild` checks the resulting relationships after its atomic move; a move within the same domain remains valid, and an invalid move dies naming ids and the boundary. `Scene.removeChild` clears edges touching any node in the detached subtree. Destruction must collect the affected subtree ids *before* calling `Tree.remove`, then clear all edges touching those ids: `Tree.remove` deletes only the selected entry and leaves its descendants live but unmounted. This also covers destruction of an ancestor whose descendants are mask endpoints. Renderer frame validation repeats the checks for serialized or externally constructed frames. Use the existing loud defect/`RenderException` seams and name the target id, source id, and violated rule. A forged frame with a missing source must never silently render as an unmasked target.

### D3 — Source coverage and recursive masks

During a frame walk, collect world transform, tier, composition membership, opacity, and ancestry for each id. A referenced source subtree is excluded from ordinary output. A source pass renders its subtree into a transparent alpha target through its tier's camera and bounds. It uses the same built-in geometry, text glyph coverage, image alpha, fill/stroke alpha, visibility, ancestor opacity, depth ordering, and alpha-over blending as ordinary drawing; RGB is ignored. Source ownership is global: if a child C of source Group G is itself an active source root, exclude C's entire subtree from G's pass. C is rendered only for its own target. The source pass starts at its source root; it includes that root's direct mask and masks on eligible descendants, but not masks attached to ancestors above it. Ancestor transforms and ordinary opacity still contribute. Thus sibling source S and target T under masked G do not bake G's mask into S's coverage; G's mask is applied once to T in ordinary output. An attached source that is also masked evaluates its own mask first. These evaluations form a dependency DAG and run in topological order. Overlapping children of an ordinary Group compose alpha as individually painted leaves, matching today's non-isolated Group opacity; a played scene has its existing isolated alpha plane and bounded background.

The source pass does not test source depth against target depth. Projection yields one alpha field in composition pixels. For each target fragment, sample that field at the fragment's projected pixel, form `M` or `1 − M`, and multiply the fragment's own alpha. Ancestor masks supply further multiplicative factors to descendants. For a plain masked Group, apply those factors per leaf (including child composition planes), so its children keep global depth interleaving. A rendered child composition is isolated only because `Scene.play` already makes it so. Mask textures must use the corresponding composition's pixel dimensions and camera; parent masks on a comp sample in the parent domain. The same calculation runs for root HUD with its identity camera, and inside comp world/HUD passes with that comp's camera and bounds. A cross-domain reference is rejected, never sampled through mismatched projections.

### D4 — Depth and focus

The target's projected geometry continues to supply color and depth. A fully masked-out fragment is discarded before either output, so the background can show through; a fully covered opaque fragment writes depth as today. Fractional output is translucent and writes no depth in the ordinary render path. `Sync.applyDepthWrite` is material-wide, so it cannot classify pixels whose mask coverage varies across one object. Nor can a generic mutation of `MeshBasicNodeMaterial` cover glyph Text (`depthInk` is a two-pass toolkit mesh) and strokes (`BlendedLine2NodeMaterial`).

Use a shared **masked-leaf capture and proxy seam** after native `EntityRenderer.build/update` and before the composition's ordinary world/HUD draw. Capture each masked drawable leaf in two isolated passes at its tier's camera, viewport, and existing layer transform:

1. **Native color/alpha pass:** draw the retained object with its normal materials into a transparent color target. This preserves fill and image alpha, world-unit stroke shading, glyph `depthInk` color, and the `Scene.play` plane. Its depth attachment is *not* authoritative: `Sync.applyDepthWrite` disables depth writes for translucent fills, strokes, and images.
2. **Coverage-aware geometry-depth pass:** replay the same leaf's geometry into a separate depth target with depth writes forced on wherever the leaf's *intrinsic* fragment alpha is greater than zero, regardless of its ordinary material-wide `depthWrite` value. Use a retained depth-capture variant for each built-in drawable: fill geometry and its color alpha; world-unit Line/Path stroke geometry and stroke alpha; Image planes and decoded texture alpha; glyph geometry and SDF atlas coverage through the Text adapter (reusing the toolkit's glyph layout/resources); and composition planes with their rendered texture alpha. The variant keeps the native fragment positions, billboard/orientation, clips, and alpha coverage, discarding zero-alpha fragments before writing. The nearest contributing fragment supplies depth when one leaf overlaps itself. The native color pass stays unchanged, so this extra depth write never changes its alpha blending. For a fully transparent leaf the depth target stays empty.

The renderer's internal built-in capture adapters provide those depth variants behind one Sync-facing capture interface; they are retained and disposed with the leaf. This is necessary for translucent targets: a `Rect` with `opacity: 0.5` has no native depth, but its geometry-depth pass still records its plane at every contributing pixel. Do not infer depth from the native color pass's depth attachment or substitute source depth. The Text adapter must explicitly replay SDF glyph coverage, including partially covered ink, rather than assuming the toolkit's ordinary `depthInk` pass supplies every needed pixel. If a custom renderer does not provide coverage-aware depth capture, a masked use fails with a named unsupported-renderer diagnostic instead of silently using background depth.

After source alpha factors are ready, a pair of retained proxy draws replaces the leaf in the composition scene. Both sample native color/alpha, the independent geometry-depth target, and the multiplied normal/inverse mask factors in screen pixels, and preserve premultiplied color through the alpha multiplication:

1. Opaque proxy: discard unless effective alpha is fully opaque; write the captured fragment depth and color.
2. Fractional proxy: discard zero and fully opaque pixels; depth-test at the captured fragment depth, blend the effective alpha, and leave depth writes off.

The proxy must output the geometry-depth pass's per-pixel depth (fragment-depth output), rather than the depth of its screen quad, so nearer/farther unmasked siblings still occlude correctly even when native alpha is fractional. A pixel with zero native alpha or no geometry depth is discarded in both proxy classes. In the shared render schedule, native unmasked leaves and masked proxies keep the existing depth sort and `syncLayers` tie rank; the opaque and transparent queues retain that ordering, with the two proxy classes never drawing the same pixel. A source Group's own alpha pass uses the same proxies for any masked descendants. The composition plane is captured/proxied in its *parent* tier after its child target is drawn, so child depth remains internal. This common seam is the integration point for fills, image planes, strokes, glyph Text, and comp planes. Put fragment-depth shader and render-target operations behind `@effect-motion/three`'s Effect boundary; if the current node-material API cannot express fragment-depth output, use a wrapper-owned WebGPU pass with the same inputs and tests rather than weakening depth semantics.

For depth of field, place world proxies in `Sync.scene` before the root `PostProcessing.pass`, so the masked target geometry depth (not source or background depth) feeds focus. Extend `withSeeThroughDepth`'s temporary depth lending to fractional proxies only, preserving their zero-alpha discard, using geometry-capture depth, and restoring depth-write afterward. The existing depth-lending approximation for semi-transparent shapes still applies; it is not upgraded by this change. HUD proxies stay in `hudScene`, after the world focus pass. Child comps remain sharp internally while their parent plane takes the parent's focus. A masked child comp plane therefore blurs as one layer at its parent depth.

### D5 — Retained rendering and adapters

Key retained coverage resources by source/target attachment identity, composition, tier, and viewport size. Reuse targets and material bindings when these are stable; update only changed source state, transforms, camera, or dependent mask state. Sharing a source among targets is disallowed so one attachment has one clear owner. Release attachment-owned targets, materials, and descendant retained objects on replace/clear, disappearance, resize replacement, and renderer disposal. Keep font/image resource loading in the existing shared resolver, which already scans frame instances. The unmasked path never creates coverage resources or changes its draw pipeline. Integrate the coverage pass into the common Renderer/Sync path used by both browser and Node rather than separate adapter implementations.

## Risks / Trade-offs

- **[Per-fragment alpha versus depth]** → A single transparency flag cannot satisfy both full and partial coverage. Implement the two-class draw behavior in D4 and verify behind-object visibility, opaque occlusion, and partial overlap visually.
- **[Native translucent captures contain no depth]** → Use the independent coverage-aware geometry-depth replay in D4; verify an opacity-0.5 target at a distinct depth before integrating DoF. The Text adapter must expose glyph SDF coverage for this replay; if the toolkit does not expose it directly, build the replay from the already-owned layout and atlas resources rather than using background depth or narrowing mask support.
- **[Source suppression changes after clear]** → Restore a former source's ordinary rendering on the clear/replacement frame; document it and verify transitions.
- **[Mask source inside a nested comp]** → Domain validation prohibits crossing its render-target boundary. Mask the `Scene.play` group from outside or pair both endpoints inside the child; verify both paths.
- **[Depth-of-field transparency is already approximate]** → Preserve the documented existing approximation and verify masked edges at opaque depths without promising physical transparency blur.
- **[Published older specs contain stale descriptions of transforms/visibility]** → Follow current `Entity.ts`, `Sync.ts`, and the newer `entity-transform`/composition-camera design; do not broaden this change into a cleanup of historical spec text.

## Migration Plan

No existing scene opts into masking. Add the frame field with an empty default for older serialized frames, retain the existing unmasked draw path, and add guides/examples alongside implementation. Roll back the core frame/API and shared renderer changes together if parity or depth validation fails; no stored user data needs migration.
