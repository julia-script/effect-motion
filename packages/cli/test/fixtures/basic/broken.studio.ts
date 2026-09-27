// a misconstructed scene: an Effect.fn passed where Scene.make wants a generator
import * as Effect from "effect/Effect";
import { type Runner, Scene } from "effect-motion";
import { studioConfig } from "../../../src/StudioConfig";
import { scene as dot } from "./src/scenes/dot";

const broken: Scene.Scene<unknown, Runner.Runner> = Scene.make(
	// @ts-expect-error — the mistake under test
	Effect.fn(function* () {
		yield* Scene.sleep("10 millis");
	}),
);

export default studioConfig({ scenes: { dot, broken } });
