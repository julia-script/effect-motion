import { studioConfig } from "@effect-motion/cli";
import { scene as main } from "./src/main";
import { scene as helloWorld } from "./src/scenes/hello-world";

// The studio's registration: keys are the picker's unique identifiers
// (labels come from Scene.make's display name when set). Register every
// scene you want to preview — `motion studio` serves exactly this record.
// When a scene declares typed resources (fonts, images), provide their
// loaders here as one `layers` (Layer.mergeAll(Font.layer(...), ...)) —
// the file will not compile until every registered scene is covered.
export default studioConfig({
	scenes: {
		"hello-world": helloWorld,
		main,
	},
});
