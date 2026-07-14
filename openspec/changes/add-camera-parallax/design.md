# Design: animatable camera + per-layer parallax

## The one architectural decision: where the transform lives

A shape's render function is a pure `data -> SvgNode` and knows nothing about
screen vs. world (`circle` emits `cx: data.x`). So a camera must either
(a) transform coordinates per instance, or (b) inject wrapping transforms the
tree sits inside.

**We choose (b), at the sink, per top-level layer.** Instance data stays in
world coordinates; the camera is a view transform applied once per layer where
the sink already folds `FrameMeta` into the `<svg>`. This keeps determinism
trivial (world coordinates are byte-identical regardless of camera) and keeps
`moveTo` semantics honest (a circle at world x=100 always has `data.x === 100`).

Option (a) — mapping every shape's x/y world→screen inside each render function
— was rejected: it touches every render function, forces a z field onto every
shape, and fights the "the engine renders, it does not compute a projection"
grain in AGENTS.md.

## Why a single wrapping `<g>` is not enough

The single-transform trick (`<g transform="translate(-camX) scale(zoom)">`
around the whole tree) works for a plain camera but **breaks under parallax**:
different depths must move by different amounts, so there cannot be one
transform for the whole tree. Parallax forces **one transform per depth layer**
— which is why the transform is applied per top-level Group, not once globally.

effect-motion already has layers: they are `Group`s. AGENTS.md forbids a second
structure ("One structure: the instance tree"), so a parallax layer is just a
Group carrying a `depth` — no new tree concept.

```
<svg>
  <rect bg/>
  <g transform="<camera × depth_far>">  ...far layer children...  </g>
  <g transform="<camera × depth_mid>">  ...mid layer children...  </g>
  <g transform="<camera × depth_hud=0>"> ...HUD, screen-fixed...   </g>
</svg>
```

## Camera as an Instance

Decision: the camera is a real `Instance`, not plain runner state. This is the
entire payoff — because animators dispatch on `Instance.isInstance` and resolve
with the instance, a camera instance gets `move`/`moveTo`/`fade`-style pipeable
animation, `spring`/`springTo`, `Scene.fork`, and `Scene.all`/`stagger` **for
free**. No new animator code ships in this change.

- Camera entity: `~position` trait over `{x, y}` (reuse `Shape2D.positionLens`)
  plus a numeric `zoom` field (animate raw via `tween`/`tweenTo`/`spring`).
- It is never registered with a sink renderer, so it never draws. It is view
  state that happens to be an instance so the primitives apply.
- The runner holds a reference to the current camera (a scene has one active
  camera; default is an identity camera at `{x:0, y:0, zoom:1}` so existing
  scenes render unchanged). `runner.state` reads the camera's current data into
  `FrameMeta.camera`.

Open sub-question for tasks: **how the scene selects the camera** — a
`Scene.camera(instance)` setter, or `Scene.make` instantiates a default one the
author animates. Leaning toward an explicit `Scene.camera(cam)` that swaps the
active camera, with a default identity camera present so `depth`/zoom work with
no ceremony. Resolve during apply.

## The depth formula (pan + zoom together)

`depth` scales the camera's **entire** effect on a layer — translation and zoom
together — by lerping the layer's transform from identity toward the full
camera:

```
factor = depth              // 0 = pinned to screen, 1 = full camera

layerZoom  = 1 + (camera.zoom - 1) * factor
layerPanX  = camera.x * factor        // world units the camera has panned
layerPanY  = camera.y * factor

// screen transform for the layer (pan first, then zoom about viewport center):
transform = translate(cx, cy)
            scale(layerZoom)
            translate(-cx, -cy)
            translate(-layerPanX, -layerPanY)
```

Consequences, all intended:

- `depth: 1` (default) → full pan + full zoom. Existing single-layer scenes
  behave as if the whole world moves with the camera.
- `depth: 0` → identity → a true screen-fixed HUD: no pan, no scale. This is
  why HUDs need no separate `ignoreZoom` flag — depth 0 escapes both axes.
- `depth: 0.3` → 30% pan and 30% of the way toward full zoom. Distant layers
  both drift slower AND resize less under a dolly, which is correct parallax.

`cx, cy` = viewport center (`width/2, height/2`) so zoom is about the center of
frame, not the world origin. This is the conventional "zoom into the middle of
the shot" behavior; a future camera could expose a focal point.

Nesting note: `depth` is honored on **top-level** Groups (direct children of
root) — those are the parallax layers. A `depth` on a nested Group is applied by
its own `<g>` composing with its parent's transform (SVG composes transforms
naturally); v1 documents that authoring parallax means depth on top-level
layers, and does not attempt a scene-graph-wide depth resolution.

## Determinism

The camera adds no wall-clock and no randomness. Camera animation lands frame-
exact because it reuses the same duration/spring animators (which already
satisfy the "land exactly on target / snap on settle" invariant). World data is
unchanged by the camera, so seeded sequences and frame bytes for non-camera
state are identical to before when the camera is identity.

## Alternatives considered

- **Per-instance continuous z** (every shape has a z, sink computes per-shape
  offset): more "3D," but pushes toward rejected Option (a), forces z onto every
  shape, and is a bigger surface. Per-Group layers are the 80% feature at ~20%
  cost, and a per-instance z remains addable later.
- **Camera as plain runner state** with bespoke camera animators: loses the
  entire reuse win; rejected.
- **`ignoreZoom` flag on HUD layers** instead of the depth formula: an extra
  flag for what `depth: 0` already expresses; rejected.
