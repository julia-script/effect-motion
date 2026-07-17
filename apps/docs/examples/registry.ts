import type { PlayerProps } from "@effect-motion/react";
import { scene as appendChild } from "./append-child.scene";
import { scene as cameraParallax } from "./camera-parallax.scene";
import { scene as cameraShake } from "./camera-shake.scene";
import { scene as cameraSwap } from "./camera-swap.scene";
import { scene as cameraZoom } from "./camera-zoom.scene";
import { scene as chain } from "./chain.scene";
import { scene as children } from "./children.scene";
import { scene as crossfade } from "./crossfade.scene";
import { scene as customFonts } from "./custom-fonts.scene";
import { scene as depth3d } from "./depth-3d.scene";
import { scene as easingRace } from "./easing-race.scene";
import { scene as floatingField } from "./floating-field.scene";
import { scene as floatingMotes } from "./floating-motes.scene";
import { scene as forkBackground } from "./fork-background.scene";
import { scene as groups } from "./groups.scene";
import { scene as images } from "./images.scene";
import { scene as moonMoth } from "./moon-moth.scene";
import { scene as particleField } from "./particle-field.scene";
import { scene as particles } from "./particles.scene";
import { scene as repeat } from "./repeat.scene";
import { scene as seededRandomness } from "./seeded-randomness.scene";
import { scene as snow } from "./snow.scene";
import { scene as springs } from "./springs.scene";
import { scene as stagger } from "./stagger.scene";
import { scene as text } from "./text.scene";
import { scene as theBox } from "./the-box.scene";

/**
 * Every example the docs can embed. The key doubles as the source file
 * name (`examples/<key>.scene.ts`) that the Example component displays.
 */
export const examples: Record<string, PlayerProps["scene"]> = {
	"easing-race": easingRace,
	springs,
	groups,
	"camera-parallax": cameraParallax,
	"depth-3d": depth3d,
	"camera-zoom": cameraZoom,
	"camera-shake": cameraShake,
	"camera-swap": cameraSwap,
	children,
	"append-child": appendChild,
	"moon-moth": moonMoth,
	"seeded-randomness": seededRandomness,
	repeat,
	chain,
	stagger,
	"fork-background": forkBackground,
	particles,
	"particle-field": particleField,
	"floating-field": floatingField,
	"floating-motes": floatingMotes,
	snow,
	crossfade,
	"custom-fonts": customFonts,
	images,
	text,
	"the-box": theBox,
};
