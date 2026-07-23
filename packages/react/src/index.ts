/**
 * `@effect-motion/react` — play effect-motion scenes in the browser.
 *
 * @remarks
 * One component: {@link Player}, a self-contained video-style player with
 * play/pause, a scrubber, a time readout, and a repeat toggle. Point it at
 * a scene and it renders.
 *
 * ```tsx
 * <Player scene={scene} />
 * ```
 *
 * Playback is streamed rather than pre-rendered. Frames are pulled from the
 * scene on demand and buffered, so a long scene starts playing without
 * being computed to the end first, and an endless one plays without
 * accumulating forever.
 *
 * Everything is per-mount: each `Player` owns its own GPU renderer and
 * scene run, disposed on unmount. Several on a page do not interfere, and
 * navigating away releases the GPU resources.
 *
 * The component needs a browser — it renders through WebGPU to a canvas.
 * Under a framework that server-renders, it is already marked
 * `"use client"`.
 *
 * @example
 * A scene with a custom font. The `renderLayers` prop is REQUIRED when the
 * scene declares resources, and the types enforce it.
 * ```tsx
 * import { Player } from "@effect-motion/react";
 * import * as Font from "effect-motion/Font";
 * import * as Resource from "effect-motion/Resource";
 *
 * const Inter = Font.Font("Inter");
 *
 * <Player
 * 	scene={scene}
 * 	renderLayers={Font.layer(Inter, Resource.fetchBytes("/fonts/inter.ttf"))}
 * 	autoPlay
 * />
 * ```
 *
 * @packageDocumentation
 */
export { Player, type PlayerProps } from "./Player.js";
