import { fileURLToPath } from "node:url";
import * as Video from "@effect-motion/export/Video";
import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import * as Layer from "effect/Layer";
import { Drift, Groove, Hit, Riser, scene, Tick } from "./audio.scene";

const bytes = (name: string) =>
	Effect.flatMap(FileSystem, (fs) =>
		fs.readFile(fileURLToPath(new URL(`../public/${name}`, import.meta.url))),
	);
const audio = Layer.mergeAll(
	Video.prepareAudio(Groove, bytes("audio-groove.wav")),
	Video.prepareAudio(Drift, bytes("audio-drift.wav")),
	Video.prepareAudio(Riser, bytes("audio-riser.wav")),
	Video.prepareAudio(Hit, bytes("audio-hit.wav")),
	Video.prepareAudio(Tick, bytes("audio-tick.wav")),
);

// Run from the repository root:
// bun packages/cli/src/bin.ts render apps/docs/examples/audio.render.ts
export default Video.render(scene, "tmp/audio-preview.mp4").pipe(
	Effect.provide(audio),
);
