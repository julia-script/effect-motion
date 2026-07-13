import type { AnyScene } from "@effect-motion/react";
import { scene as easingRace } from "./easing-race.scene";
import { scene as groups } from "./groups.scene";
import { scene as seededRandomness } from "./seeded-randomness.scene";
import { scene as springs } from "./springs.scene";

/**
 * Every example the docs can embed. The key doubles as the source file
 * name (`examples/<key>.scene.ts`) that the Example component displays.
 */
export const examples: Record<string, AnyScene> = {
	"easing-race": easingRace,
	springs,
	groups,
	"seeded-randomness": seededRandomness,
};
