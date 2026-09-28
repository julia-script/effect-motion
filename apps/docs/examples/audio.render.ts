import { fileURLToPath } from "node:url";
import * as Video from "@effect-motion/export/Video";
import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { Accent, Cool, scene, Warm } from "./audio.scene";

const bytes = (name: string) =>
	Effect.flatMap(FileSystem, (fs) =>
		fs.readFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url))),
	);
const audio = Layer.mergeAll(
	Video.prepareAudio(Warm, bytes("audio-warm.wav")),
	Video.prepareAudio(Cool, bytes("audio-cool.wav")),
	Video.prepareAudio(Accent, bytes("audio-accent.wav")),
);

// Run from the repository root:
// bun packages/cli/src/bin.ts render apps/docs/examples/audio.render.ts
export default Video.render(scene, "tmp/audio-preview.mp4").pipe(
	Effect.provide(audio),
);
