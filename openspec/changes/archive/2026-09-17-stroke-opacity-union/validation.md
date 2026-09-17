## Mechanism and scope

`Stroke.ts` owns one retained mask per planar entity. Segment bodies and round
vertex joins/caps write opaque occupancy with NoBlending and no depth rejection
into a four-sample target. Resolve occurs after all subpaths; the resulting alpha
multiplies stroke color alpha and entity opacity in one final material. Fill is a
separate earlier draw. Constant local z defines planar Line/Path eligibility;
nonplanar paths retain fat-line geometry and per-point depth.

## Evidence

- Native Node stress scene: `/tmp/stroke-union-stress/frame-0.png` and the moving
  midpoint/final frames. Triangle and rectangle corners no longer show repeated
  paint alpha. The rectangle retains legitimate inner/outer backdrop differences.
- Five-alpha matrix: `/tmp/stroke-union-matrix/frame-0.png`, `frame-20.png`,
  `fresh-last.png`; browser `/tmp/stroke-browser.png`. All joins, self-crossings,
  multiple subpaths and retracing have uniform covered opacity. The last row's
  two independent entities visibly blend twice. Alpha zero leaves no stroke.
- Renderer suite: 41 passing tests. Planar classification, closure, zero width,
  zero-length round caps, fractional geometry, nonplanar endpoints and disposal
  are covered structurally.
- Real GPU reuse test: 16 outlines, eight frames at opacity 0.25/0.5/0.75/1/1/1/0.5/0:
  16 geometry builds, 16 rasterizations, 16 allocations total; all 16 targets receive
  disposal on removal. The test took 471 ms on this machine including renderer work.
- Renderer/three type checks, docs checks and touched-file formatting.

Four-sample coverage is the starting point for the following subpixel investigation.
The mask union does not depend on a particular antialiasing strength or pixel match.
