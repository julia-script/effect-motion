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

Apply mask factors at the **native drawable fragment**, before that drawable blends or depth-tests against the rest of its composition. Do not first capture a whole target leaf into one color/depth image. A Path is one `Retained` group but contains separate fill and stroke drawables for each subpath, with potentially different per-vertex z; preblending that group would expose a far translucent subpath in front of an intervening sibling when the proxy uses the near subpath's depth. Per-primitive capture still fails for a single non-planar stroke or mesh where depth varies per fragment. The mask factor must therefore enter each drawable's fragment output while its own rasterized depth remains available to the ordinary depth test.

Sync resolves the applicable source alpha textures and normal/inverse factors for each drawable. Extend the retained built-in render adapters with a mask-aware fragment variant, selected only for a masked target. At each native fragment, compute intrinsic alpha `A`, sample each source factor at that fragment's projected composition pixel, and set effective alpha `E = A × ∏ factor`. Keep intrinsic RGB and premultiplication consistent with the normal material. Make **two retained draw variants per native drawable**, using the same geometry, transform, camera, layer rank, and per-fragment z:

1. Opaque variant: discard unless `E` is fully opaque; draw color and write the native fragment depth.
2. Fractional variant: discard `E = 0` and fully opaque fragments; blend with alpha `E`, depth-test at the native fragment depth, and write no depth in the ordinary pass.

These variants run in the renderer's existing opaque/transparent ordering. They never draw the same fragment twice. `syncLayers`'s camera-relative nudge and stable tie rank apply to both variants exactly as to their original drawable. Every Path fill mesh and fat-line stroke keeps its own draw position in that order; an opaque sibling between far and near translucent subpaths rejects the far fragments and leaves the near ones visible. A translucent Rect still has its own plane depth even though `Sync.applyDepthWrite` normally disables writes: the fractional variant reads the rasterized fragment depth for testing, without needing a color-target depth attachment. No target color or depth is precomposited across subpaths or overlapping leaves. This also preserves varying depth within one 3D stroke.

The fragment adapter is specific at its material boundary but presents one Sync-facing mask-factor input: filled shapes and Image planes extend their node material alpha; the `@effect-motion/three` blended Line/Path material extends its fragment alpha; the Text adapter applies the factor inside glyph SDF ink output while preserving the toolkit's layout/atlas and depth-ink behavior; and a `Scene.play` composite plane uses the same plane-material path in its *parent* tier after its child target is drawn. Masked Text must classify its glyph ink into the two variants instead of letting an unmodified toolkit depth pass write through a zero or fractional mask. If the toolkit has no such material hook, implement the adapter's masked glyph draw from the already-owned layout and atlas resources. A custom renderer that lacks this fragment capability fails by name when masked; its unmasked path stays unchanged. Keep resource creation, material disposal, and any external shader API behind the owning Effect-wrapped actors.

For depth of field, world variants remain in `Sync.scene` before the root `PostProcessing.pass`, so focus reads the target fragments' depth, never source or background depth. Extend `withSeeThroughDepth` to lend depth temporarily to fractional variants during the DoF pass while retaining the zero-alpha discard and restoring depth-write afterward. This preserves the existing semi-transparent approximation. HUD variants stay in `hudScene` and remain sharp. Child comps remain sharp internally while their parent plane takes the parent's focus; masking that plane changes its alpha at the plane's own depth.

### D5 — Retained rendering and adapters

Key source-coverage targets by attachment identity, composition, tier, and viewport size; retain the mask-aware material variants with their native drawable. Reuse targets and material bindings when these are stable; update only changed source state, transforms, camera, or dependent mask state. Sharing a source among targets is disallowed so one attachment has one clear owner. Release attachment-owned targets, variant materials, and descendant retained objects on replace/clear, disappearance, resize replacement, and renderer disposal. Keep font/image resource loading in the existing shared resolver, which already scans frame instances. The unmasked path never creates coverage resources or changes its draw pipeline. Integrate the coverage pass into the common Renderer/Sync path used by both browser and Node rather than separate adapter implementations.

## Risks / Trade-offs

- **[Per-fragment alpha versus depth]** → A single transparency flag cannot satisfy both full and partial coverage. Implement the two native fragment variants in D4 and verify behind-object visibility, opaque occlusion, and partial overlap visually.
- **[Leaf-level capture flattens Path depth]** → Keep every Path fill/stroke and every varying-depth fragment in the main draw/depth order; verify near/far translucent subpaths around an opaque sibling. No target color/depth precomposite is allowed.
- **[Toolkit glyph fragment integration]** → The Text adapter needs its SDF ink coverage before depth writes. If the toolkit does not expose a material hook, build the masked glyph variant from the already-owned layout and atlas resources rather than narrowing Text mask support.
- **[Source suppression changes after clear]** → Restore a former source's ordinary rendering on the clear/replacement frame; document it and verify transitions.
- **[Mask source inside a nested comp]** → Domain validation prohibits crossing its render-target boundary. Mask the `Scene.play` group from outside or pair both endpoints inside the child; verify both paths.
- **[Depth-of-field transparency is already approximate]** → Preserve the documented existing approximation and verify masked edges at opaque depths without promising physical transparency blur.
- **[Published older specs contain stale descriptions of transforms/visibility]** → Follow current `Entity.ts`, `Sync.ts`, and the newer `entity-transform`/composition-camera design; do not broaden this change into a cleanup of historical spec text.

## Migration Plan

No existing scene opts into masking. Add the frame field with an empty default for older serialized frames, retain the existing unmasked draw path, and add guides/examples alongside implementation. Roll back the core frame/API and shared renderer changes together if parity or depth validation fails; no stored user data needs migration.
