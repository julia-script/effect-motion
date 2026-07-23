# @effect-motion/react

React bindings for [effect-motion](https://www.npmjs.com/package/effect-motion): a `<Player>` component for playing scenes in the browser.

Frames stream in as the scene runs rather than being rendered up front, so playback starts before the whole scene is computed. By default a finite scene keeps every frame it has pulled, which makes seeking backwards free; an endless scene keeps a bounded window instead.

## Install

`effect` and `effect-motion` are peer dependencies — install them alongside:

```bash
pnpm add @effect-motion/react effect-motion effect
```

## Play a scene

`<Player>` runs the scene and gives you transport controls — play/pause, a scrubbable progress bar, and a repeat toggle:

```tsx
import { Player } from "@effect-motion/react";
import { scene } from "./my-scene";

export function App() {
	return <Player scene={scene} autoPlay />;
}
```

The player's size comes from its container — the canvas fills the available width at the scene's aspect ratio, and the scene's own resolution is set when you write it (`Scene.make(…, { width, height })`).

For a scene that never ends, pass `isInfinite` so memory stays bounded and the scrubber (which has no meaning without an end) is hidden:

```tsx
<Player scene={ambientScene} isInfinite autoPlay />
```

If the scene uses custom fonts or images, pass their loaders as `renderLayers`. It is required — and checked at compile time — whenever the scene declares resources:

```tsx
<Player scene={scene} renderLayers={Font.layer(Inter, bytes)} />
```

## Documentation

Full docs, concepts, and live examples: **https://github.com/julia-script/effect-motion**
