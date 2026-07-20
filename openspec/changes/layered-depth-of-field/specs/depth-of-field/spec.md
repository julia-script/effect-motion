# depth-of-field Delta Specification

## MODIFIED Requirements

### Requirement: Focus fields are camera data
The camera SHALL carry a `focusDistance` (view-space distance to the sharp plane, defaulting to the resting camera distance so a world-z=0 object is in focus for an untouched camera), an `aperture` (blur strength, defaulting to 0), and an optional **aperture shape** describing the bokeh: a blade count (a circular aperture when unset or below 3) and a blade rotation in radians (defaulting to 0). All SHALL be plain data fields driven by the existing animators, and all SHALL ride on frame metadata like the other camera fields.

#### Scenario: Rack focus is a plain tween
- **WHEN** a scene tweens `focusDistance` between two values
- **THEN** the sharp plane moves smoothly across frames with no DoF-specific animator

#### Scenario: Defaults keep the z=0 plane sharp
- **WHEN** a camera is created without setting focus fields
- **THEN** `focusDistance` equals the resting camera distance and `aperture` is 0

#### Scenario: Bokeh shape defaults to circular
- **WHEN** a camera sets `aperture > 0` without setting a blade count
- **THEN** out-of-focus highlights render as circles, and existing scenes' appearance is unchanged by the presence of the new fields

#### Scenario: Blade rotation is animatable
- **WHEN** a scene tweens the aperture's blade rotation with a polygonal blade count set
- **THEN** the bokeh polygons rotate smoothly across frames

### Requirement: Blur follows depth deterministically
With `aperture > 0`, blur SHALL be per-pixel: a pure function of each pixel's view-space depth and the frame's camera — exactly zero at the focus plane, increasing continuously with distance from it, scaled by aperture. The same frame data SHALL always produce the same blur field; rendered pixels are not required to be byte-identical across environments.

#### Scenario: The focus plane is sharp
- **WHEN** a shape sits at view depth equal to `focusDistance` with `aperture > 0`
- **THEN** it renders sharp (visually identical to the same shape with aperture 0)

#### Scenario: Off-plane content blurs, more with distance
- **WHEN** two identical shapes sit at increasing distances from the focus plane
- **THEN** both render blurred, the farther-from-focus one more strongly, with no discrete banding between depths

### Requirement: Aperture zero is structurally off
With `aperture` 0 (the default), rendering SHALL take the plain render path — the depth-of-field pass chain is bypassed entirely, with no layer separation, no intermediate targets rendered, and no per-frame DoF computation or cost — and produce output indistinguishable from a renderer without depth-of-field support.

#### Scenario: Existing scenes are unaffected
- **WHEN** any scene that never sets `aperture` renders
- **THEN** the frame renders through the plain path with no DoF pipeline involvement

#### Scenario: Bokeh fields alone do not enable the chain
- **WHEN** a scene sets a blade count but leaves `aperture` at 0
- **THEN** the DoF chain stays bypassed

## ADDED Requirements

### Requirement: Out-of-focus foreground bleeds over sharp background
A blurred foreground subject SHALL spread beyond its own silhouette onto sharper content behind it, in proportion to its circle of confusion. A sharp background pixel adjacent to a blurred foreground SHALL receive that foreground's color where the foreground's blur reaches it — the foreground's edge SHALL NOT render as a hard cutout against the background.

#### Scenario: A near subject halos over a sharp background
- **WHEN** a near subject is far enough off the focus plane to blur strongly, in front of an in-focus background
- **THEN** the subject's blurred edge extends past its geometric silhouette, softly covering background pixels, with no visible hard boundary at the silhouette

#### Scenario: Background stays sharp outside the bleed
- **WHEN** the same frame is sampled far from any blurred foreground
- **THEN** the in-focus background renders sharp — the bleed is local to the foreground's circle of confusion, not a global softening

### Requirement: Layers composite in depth order
The renderer SHALL separate the frame into near (in front of focus), in-focus, and far (behind focus) layers by signed circle of confusion, blur each independently, and composite them near-over-focus-over-far using coverage. Occlusion between layers SHALL follow that order — a blurred near layer covers the layers behind it in proportion to its coverage rather than averaging equally with them.

#### Scenario: Near blur covers rather than averages
- **WHEN** a strongly blurred near subject overlaps an in-focus mid subject
- **THEN** the near subject's color dominates where its coverage is high, and the mid subject shows through where coverage is low — the overlap does not read as a 50/50 blend

#### Scenario: Far blur does not bleed over sharp foreground
- **WHEN** a blurred far subject sits behind an in-focus foreground subject
- **THEN** the foreground's edge stays sharp and the far subject's blur does not wash over it

### Requirement: Blur is free of sampling artifacts on flat content
On large areas of flat color — the worst case for stochastic sampling — the blur SHALL show no visible tap structure: no discrete overlapping copies of the source, no ring or petal patterns, and no per-pixel noise that reads as grain in motion. Blur quality SHALL NOT depend on scene content being noisy or textured.

#### Scenario: A flat blurred disc has a smooth falloff
- **WHEN** a solid-color circle on a solid background is rendered strongly out of focus
- **THEN** its falloff is smooth and monotonic from center to edge, with no concentric rings, petal lobes, or visible individual tap positions

#### Scenario: Blur is stable across consecutive frames
- **WHEN** consecutive frames of an animating out-of-focus subject are compared
- **THEN** the blur shows no frame-to-frame sampling noise that would read as shimmer or crawl in motion

### Requirement: Aperture shape drives bokeh
With a polygonal blade count set, out-of-focus highlights SHALL take that polygonal shape at the configured rotation; with no blade count (or fewer than 3 blades) they SHALL be circular. The shape SHALL apply consistently across near and far layers.

#### Scenario: Hexagonal bokeh from six blades
- **WHEN** a small bright highlight is rendered far out of focus with a blade count of 6
- **THEN** it renders as a hexagon rather than a circle

#### Scenario: Shape is identical in both render paths
- **WHEN** the same frame with a polygonal aperture renders in the browser and through the headless export path
- **THEN** the resulting bokeh shape is the same (the two paths share one implementation)
