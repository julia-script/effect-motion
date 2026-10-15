// fixture studio entrypoint: explicit registration, no glob
import { studioConfig } from "../../../src/StudioConfig";
import { scene as branded, layers } from "./src/scenes/branded";
import { scene as dot } from "./src/scenes/dot";

export default studioConfig({
	scenes: { dot, branded },
	layers,
});
