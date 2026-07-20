import { Video } from "@effect-motion/export";
import * as Effect from "effect/Effect";
import { scene as main } from "./src/main";

// An ordinary program: `motion render` executes this default export with
// the platform provided (it also runs standalone via `tsx render.ts` by
// piping through NodeServices from @effect/platform-node). More outputs
// are more Video.render calls; scenes with typed resources provide their
// loader layers right here with Effect.provide — checked at compile time.
export default Effect.gen(function* () {
	yield* Video.render(main, "./output/main.mp4", {
		settings: { frameRate: 60 },
	});
});
