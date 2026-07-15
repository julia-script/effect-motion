# effect-motion

Deterministic, frame-exact motion graphics in code, composed with [Effect](https://effect.website).

A scene is an Effect generator program: instantiate entities, then tween or spring their properties, composing motions sequentially or in parallel. Scenes are **deterministic** — seeded randomness and a frame-locked clock make every run byte-identical — and **finite**, which is what lets a scene be scrubbed and replayed like a video.

## Install

`effect` is a peer dependency — install it alongside:

```bash
pnpm add effect-motion effect
```

## Write a scene

Every `yield*` composes another effect into the scene.

```ts
import { Motion, Scene, Shapes } from "effect-motion";

export const scene = Scene.make(function* () {
	const circle = yield* Scene.instantiate(Shapes.Circle, {
		x: 60,
		y: 150,
		radius: 16,
		fill: "#7f5af0",
	});

	yield* circle.pipe(
		Motion.tweenTo({ x: 440 }, "1 second", "easeInOutCubic"),
	);
});
```

Render it to SVG, play it in React with [`@effect-motion/react`](https://www.npmjs.com/package/@effect-motion/react), or export it to a video with [`@effect-motion/export`](https://www.npmjs.com/package/@effect-motion/export).

## Documentation

Full docs, concepts, and live examples: **https://github.com/julia-script/effect-motion**
