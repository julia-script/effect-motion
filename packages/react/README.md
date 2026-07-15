# @effect-motion/react

React bindings for [effect-motion](https://www.npmjs.com/package/effect-motion): a `<Player>` component and a `usePlayer` hook for playing scenes in the browser.

Because scenes are deterministic and finite, the player runs a scene once, collects every frame, and plays them back — so seeking in either direction is free.

## Install

`effect` and `effect-motion` are peer dependencies — install them alongside:

```bash
pnpm add @effect-motion/react effect-motion effect
```

## Play a scene

`<Player>` runs the scene and gives you transport controls — play/pause and a scrubbable progress bar:

```tsx
import { Player } from "@effect-motion/react";
import { scene } from "./my-scene";

export function App() {
	return <Player scene={scene} width={500} height={300} autoPlay />;
}
```

Prefer your own UI? `usePlayer(scene, options)` exposes the same state and controls (`status`, `frame`, `progress`, `play`, `pause`, `seek`, …) without any chrome.

## Documentation

Full docs, concepts, and live examples: **https://github.com/julia-script/effect-motion**
