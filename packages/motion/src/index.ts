/**
 * effect-motion — deterministic, frame-exact motion graphics in code.
 *
 * @remarks
 * Scenes are pure descriptions of animation: the same scene produces the
 * same frames on every run and every machine, because time is counted in
 * frames rather than read from a clock and randomness comes from a seed.
 *
 * Where to start:
 *
 * - `Scene` — declare a scene, create entities, compose animations, run it.
 * - `Motion` — animate over a duration, with easing.
 * - `Physics` — animate with springs, whose length emerges from the sim.
 * - `Entity` — the shapes, and `vec3` for positions.
 * - `Color`, `Timing` — the palette and the easing curves.
 * - `Camera` — aiming, orbiting, and dollying the viewpoint.
 *
 * Prefer deep per-actor imports over this barrel:
 *
 * ```typescript
 * import * as Motion from "effect-motion/Motion";
 * import * as Scene from "effect-motion/Scene";
 * ```
 *
 * @example
 * A complete scene.
 * ```typescript
 * import * as Color from "effect-motion/Color";
 * import * as Motion from "effect-motion/Motion";
 * import * as Scene from "effect-motion/Scene";
 *
 * export const scene = Scene.make(
 * 	function* () {
 * 		const dot = yield* Scene.instantiate("Circle", {
 * 			radius: 24,
 * 			fillColor: Color.hex("#7f5af0"),
 * 		});
 * 		yield* dot.pipe(
 * 			Motion.moveTo({ x: 430 }, "1 second", "easeInOutCubic"),
 * 			Motion.fadeTo(0, "400 millis"),
 * 		);
 * 	},
 * 	{ width: 500, height: 300, backgroundColor: Color.rgba(22, 22, 29) },
 * );
 * ```
 *
 * @packageDocumentation
 */

export * as Camera from "./Camera.js";
export * as Color from "./Color.js";
export { EffectMotionError } from "./EffectMotionError.js";
// the closed entity world: the union and its tags
export * as Entity from "./Entity.js";
export * as Font from "./Font.js";
export * as Image from "./Image.js";
// a reference to a live entity in the runner tree
export * as Instance from "./Instance.js";
export * as Motion from "./Motion.js";
export * as Phaser from "./Phaser.js";
export * as Physics from "./Physics.js";
export * as Particles from "./particles/index.js";
export * as Resource from "./Resource.js";
export * as Runner from "./Runner.js";
export * as Scene from "./Scene.js";
export * as Timing from "./Timing.js";
