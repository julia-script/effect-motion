# @effect-motion/export

Node-only export tools for [effect-motion](https://www.npmjs.com/package/effect-motion): rasterize SVG frames to PNG (via [resvg](https://github.com/RazrFalcon/resvg)) and encode them into a video file (via ffmpeg).

This package is for **server-side rendering** (Node). Browser playback lives in `@effect-motion/react` and does not depend on this package.

## Usage

```ts
import { NodeServices } from "@effect/platform-node";
import { Effect } from "effect";
import { Video } from "@effect-motion/export";

// scene → MP4, one call
await Effect.runPromise(
  Video.render(scene, "out.mp4", {
    settings: { width: 1920, height: 1080, frameRate: 60 },
  }).pipe(Effect.provide(NodeServices.layer)),
);
```

`Ffmpeg.encode` and `Resvg.rasterize` are the lower-level stages if you want to drive the pipeline yourself.

## Bundled ffmpeg

Video encoding uses the [`ffmpeg-static`](https://www.npmjs.com/package/ffmpeg-static) binary by default — a full build that includes **libx264**, so H.264 output works out of the box with no system ffmpeg required. Installing this package downloads that binary (~45&nbsp;MB) for your platform.

To use a system or custom ffmpeg instead, pass `binary`:

```ts
Video.render(scene, "out.mp4", { binary: "ffmpeg" });        // system ffmpeg on PATH
Video.render(scene, "out.mp4", { binary: "/path/to/ffmpeg" }); // a specific build
```

> **License note.** The `ffmpeg-static` build (and libx264) is **GPL-3.0**. It is a standalone executable this package invokes over a process boundary — it is not linked into effect-motion's own code, which stays MIT. If you redistribute the bundled binary, the ffmpeg/libx264 GPL terms apply to that binary; pass your own `binary` to avoid shipping it.
