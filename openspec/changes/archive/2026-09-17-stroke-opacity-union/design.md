## Context

See [proposal.md](proposal.md). The supplied evidence is preserved in [triangle-alpha.png](evidence/triangle-alpha.png) and [rectangle-alpha.png](evidence/rectangle-alpha.png). These images show the symptom; they are not byte-exact golden images.

Builtins.setOutline closes an outline by appending its first point. Builtins.path constructs a fat polyline per subpath. The installed three LineGeometry expands consecutive points into segment pairs; the wrapper's BlendedLine2NodeMaterial uses ordinary alpha blending. Overlapping segment coverage therefore receives paint repeatedly.

The rectangle image also contains a legitimate difference: a centered translucent border blends over colored fill on its inner side and background on its outer side. Fix the extra corner opacity, not this backdrop-dependent color.

## Goals / Non-Goals

**Goals:** one coverage region and one opacity application for a planar stroke, including subpaths/self-crossings; correct antialiased boundary and transparent holes; retained, shared browser/Node implementation.

**Non-Goals:** a new authoring stroke API, arbitrary nonplanar 3D line intersection semantics, global order-independent transparency, changing fill/whole-entity opacity semantics, or pixel-identical output.

## Decisions

### 1. Stroke identity is the entity's painting operation

All segments and subpaths of one planar Path participate in one union. Different entities never share that union. Rect/Circle/Ellipse outlines use the same stroke actor. A planar Line or Path has constant local z in its defining points; a planar rectangle can be transformed in world space without losing the guarantee.

Preserve existing path command and world-unit-width semantics. For this iteration nonplanar Line/Path content retains the existing 3D path. This boundary is geometric applicability, not automatic switching between scene paint/depth modes.

Model coverage separately from paint: effective alpha is coverage × stroke color alpha × entity opacity. Ancestor explicit paint-group opacity is applied later to its own composite, not baked into the stroke mask.

### 2. Accumulate coverage union, then composite color once

Introduce a renderer Stroke actor owning retained stroke silhouette/coverage resources. Construct the stroke silhouette with joins and closure, rasterize its union into a coverage target, and composite the chosen color once in the entity's stroke slot.

The initial GPU approach is binary occupancy per raster sample: covered samples are written as occupied with replacement/union semantics, never source-over paint alpha. Overlapping silhouette pieces cannot increase sample occupancy. Resolve coverage only after the whole entity's stroke, including every subpath, has contributed. Multisampling or supersampling supplies boundary coverage; their quality is refined by the dependent subpixel change.

Do not approximate geometric union by alpha-blending already antialiased segments into a mask. Do not take the maximum of separately resolved scalar pixel coverages as an exact union: disjoint covered samples within one pixel can be lost. Resolve once after sample occupancy has been combined.

Masks are local to the stroke plane where possible and placed with the same projection/transform as its fill. Derive bounds from the full stroke silhouette, with AA support; preserve its local origin when bounds move. In a depth context, discard zero-coverage texels before any depth write and preserve the surface's actual placement. General transparency sorting limitations remain those of the depth renderer.

Alternatives: changing blend mode changes legitimate overlaps between entities; hiding repeated fragments with ordinary depth tests makes the result depend on segment order and does not establish correct edge coverage; joined non-overlapping tessellation helps simple contours but still needs union handling for retraced/self-crossing paths.

### 3. Geometry joins and paint coverage have separate jobs

Interior vertices receive joins, not two separately painted endpoint caps. Closure is a join, not an extra exposed cap. Preserve the current intended round silhouette as the baseline; do not add join-style options here. Tessellation or analytic geometry can supply the silhouette; the union stage remains responsible for overlaps and retracing.

Fill remains a separate earlier paint. A uniform stroke alpha need not yield uniform RGB over differently colored backdrops. This change does not silently redefine whole-entity opacity into SVG-style isolated fill-plus-stroke opacity; that would be a separate contract decision.

### 4. Retain resources and integrate with context ordering

Reuse stroke geometry and masks while coverage inputs remain unchanged. Opacity/color-only changes update the final composite without regenerating coverage. Geometry, stroke width, local transform or required sampling resolution changes invalidate the appropriate state. Clear newly exposed bounds and release resources on removal/scope close.

Use Effect at fallible allocation/lifecycle boundaries and thin three actor wrappers. Frame-hot infallible mutations remain synchronous. Browser and Node share the same retained implementation.

Integrate after paint-order-compositing. Its entity paint rank supplies the stroke slot; do not add another author-facing layering mechanism. Subpixel-stroke-coverage refines the sampler and target-density policy of this same actor.

## Risks / Trade-offs

- [Masks add passes and memory] → Reuse per-entity coverage, avoid rerasterizing alpha-only fades, profile many outlined shapes and check disposal.
- [MSAA support differs by target/backend] → Verify actual supported sample counts; use a portable supersampled occupancy fallback if required.
- [New silhouette changes joins unexpectedly] → Inspect opaque and translucent controls side by side; enforce closed-contour joins without introducing a new style API.
- [Transparency accidentally writes a full quad to depth] → Test an unfilled outline over a world object and discard non-covered fragments.
- [Fractional edges still fluctuate] → Keep correctness and sampling quality distinct; the follow-on subpixel proposal verifies the final mask path.

## Migration Plan

No author API migration. Add the stroke actor and wire planar builtins into it; retain the nonplanar depth path. Land meaningful geometry/coverage/lifecycle tests plus browser/Node visual evidence. Publish a bug-fix changeset describing corrected joins. Do not expose a legacy-overlap mode; reverting the implementation is the pre-release rollback.

## Validation

Reproduce triangle/rectangle evidence; add figure-eight and retraced paths, multiple overlapping subpaths in one entity, and identical geometry split into two independent entities. Inspect alpha 0/0.25/0.5/0.75/1, open endpoints versus closure, fill/no-fill, tilted planar surfaces and opacity-only animation.

Assert sample-union structure and single paint application, not captured pixel bytes or cross-device pixel tolerances. Rendered images support human comparison. Record the SVG stroke-shape union model as the behavioral reference: https://www.w3.org/TR/SVG2/painting.html#StrokeShape.
