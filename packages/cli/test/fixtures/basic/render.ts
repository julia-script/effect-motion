// fixture render entrypoint: an ordinary program — multiple outputs are
// ordinary code. OUT dir comes from an env var (the "code is the config"
// escape hatch: knobs belong to the program, not CLI flags).
import { Video } from "@effect-motion/export";
import * as Effect from "effect/Effect";
import { scene } from "./src/scenes/dot";

const outDir = process.env.MOTION_OUT_DIR ?? "./output";

export default Effect.gen(function* () {
	yield* Video.render(scene, `${outDir}/dot.mp4`, {
		settings: { frameRate: 10 },
	});
	yield* Video.render(scene, `${outDir}/dot-hd.mp4`, {
		settings: { frameRate: 10 },
		dpr: 2,
	});
});
