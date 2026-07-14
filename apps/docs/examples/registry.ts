import type { AnyScene } from "@effect-motion/react";
import { scene as chain } from "./chain.scene";
import { scene as crossfade } from "./crossfade.scene";
import { scene as customFonts } from "./custom-fonts.scene";
import { scene as easingRace } from "./easing-race.scene";
import { scene as forkBackground } from "./fork-background.scene";
import { scene as groups } from "./groups.scene";
import { scene as moonMoth } from "./moon-moth.scene";
import { scene as particles } from "./particles.scene";
import { scene as repeat } from "./repeat.scene";
import { scene as seededRandomness } from "./seeded-randomness.scene";
import { scene as springs } from "./springs.scene";
import { scene as stagger } from "./stagger.scene";
import { scene as text } from "./text.scene";
import { scene as theBox } from "./the-box.scene";
import { scene as typewriter } from "./typewriter.scene";

/**
 * Every example the docs can embed. The key doubles as the source file
 * name (`examples/<key>.scene.ts`) that the Example component displays.
 */
export const examples: Record<string, AnyScene> = {
	"easing-race": easingRace,
	springs,
	groups,
	"moon-moth": moonMoth,
	"seeded-randomness": seededRandomness,
	repeat,
	chain,
	stagger,
	"fork-background": forkBackground,
	particles,
	crossfade,
	"custom-fonts": customFonts,
	text,
	"the-box": theBox,
	typewriter,
};
