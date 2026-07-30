import type { PlayerProps } from "@effect-motion/react";
import type * as Layer from "effect/Layer";
import { scene as animatorPairs } from "./animator-pairs.scene";
import { scene as bezier3d } from "./bezier-3d.scene";
import { scene as cameraFollowGraph } from "./camera-follow-graph.scene";
import { scene as cameraTour } from "./camera-tour.scene";
import { scene as composition } from "./composition.scene";
import { scene as crossfade } from "./crossfade.scene";
import {
	scene as customFonts,
	renderLayers as customFontsLayers,
} from "./custom-fonts.scene";
import { scene as depthOrbit } from "./depth-orbit.scene";
import { scene as easingRace } from "./easing-race.scene";
import { scene as functionPlot } from "./function-plot.scene";
import { scene as gridWarp } from "./grid-warp.scene";
import { scene as helloScene } from "./hello-scene.scene";
import { scene as images, renderLayers as imagesLayers } from "./images.scene";
import { scene as instanceTree } from "./instance-tree.scene";
import { scene as minSeeker } from "./min-seeker.scene";
import { scene as riemannRects } from "./riemann-rects.scene";
import { scene as seededWalk } from "./seeded-walk.scene";
import { scene as sineFromCircle } from "./sine-from-circle.scene";
import { scene as springs } from "./springs.scene";
import { scene as streamlines } from "./streamlines.scene";
import { scene as textWriteOn } from "./text-write-on.scene";

/**
 * Every example the docs can embed. The key doubles as the source file
 * name (`examples/<key>.scene.ts`) that the Example component displays.
 */
/** an example: its scene, plus loader layers when the scene declares resources */
export interface ExampleEntry {
	readonly scene: PlayerProps["scene"];
	readonly renderLayers?: Layer.Layer<never, unknown, never>;
}

export const examples: Record<string, PlayerProps["scene"] | ExampleEntry> = {
	// learn
	"hello-scene": helloScene,
	"instance-tree": instanceTree,
	"animator-pairs": animatorPairs,
	"easing-race": easingRace,
	springs,
	composition,
	"camera-tour": cameraTour,
	"seeded-walk": seededWalk,
	// guides
	crossfade,
	"custom-fonts": {
		scene: customFonts,
		renderLayers: customFontsLayers as Layer.Layer<never, unknown, never>,
	},
	images: {
		scene: images,
		renderLayers: imagesLayers as Layer.Layer<never, unknown, never>,
	},
	// examples gallery
	"sine-from-circle": sineFromCircle,
	"function-plot": functionPlot,
	"riemann-rects": riemannRects,
	"grid-warp": gridWarp,
	"bezier-3d": bezier3d,
	"depth-orbit": depthOrbit,
	"min-seeker": minSeeker,
	"text-write-on": textWriteOn,
	streamlines,
	"camera-follow-graph": cameraFollowGraph,
};
