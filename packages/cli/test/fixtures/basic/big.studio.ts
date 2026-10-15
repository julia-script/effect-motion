// a JSON payload well past one 64 KB pipe chunk: many instances, one frame
import { Color, Entity as S, Scene } from "effect-motion";
import { studioConfig } from "../../../src/StudioConfig";

const many = Scene.make(
	function* () {
		for (let i = 0; i < 500; i++) {
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ x: i % 120, y: i % 80 }),
				radius: 2,
				fillColor: Color.hex("#e53170"),
			});
		}
	},
	{ width: 120, height: 80 },
);

export default studioConfig({ scenes: { many } });
