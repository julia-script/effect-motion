import { fileURLToPath } from "node:url";
import * as Video from "@effect-motion/export/Video";
import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import { scene, Theme } from "./audio.scene";

const assetPath = fileURLToPath(
	new URL("../public/audio-theme.wav", import.meta.url),
);
const bytes = Effect.flatMap(FileSystem, (fs) => fs.readFile(assetPath));
const audio = Video.prepareAudio(Theme, bytes);

// Run from the repository root:
// bun packages/cli/src/bin.ts render apps/docs/examples/audio.render.ts
export default Video.render(scene, "tmp/audio-preview.mp4").pipe(
	Effect.provide(audio),
);
