import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as NodeRenderer from "@effect-motion/renderer/node";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Scene from "effect-motion/Scene";
import { frameRate, height, renderLayers, scenes, width } from "./scenes.js";

type Frame = Parameters<typeof NodeRenderer.renderToPng>[1];

const destination =
	process.argv[2] ?? join(tmpdir(), "effect-motion-mask-matrix", "node");
await mkdir(destination, { recursive: true });

for (const [name, scene] of Object.entries(scenes)) {
	const frames = [
		...(await Effect.runPromise(
			Scene.stream(scene as never, { frameRate }).pipe(
				Stream.runCollect,
				Effect.provide(renderLayers),
			) as Effect.Effect<Iterable<Frame>>,
		)),
	];
	const selected = [
		...new Set([
			0,
			Math.floor((frames.length - 1) / 2),
			frames.length - 1,
			...(name === "lifecycle" ? [1] : []),
		]),
	].sort((a, b) => a - b);
	await Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const renderer = yield* NodeRenderer.make({ width, height });
				for (const index of selected) {
					const frame = frames[index];
					if (!frame) continue;
					const png = yield* NodeRenderer.renderToPng(renderer, frame).pipe(
						Effect.provide(renderLayers),
					);
					yield* Effect.tryPromise({
						try: () => writeFile(`${destination}/${name}-${index}.png`, png),
						catch: (cause) =>
							new Error(`Could not save ${name} frame ${index}: ${cause}`),
					});
				}
			}),
		),
	);
	console.log(
		`${name}: ${frames.length} frames; exported ${selected.join(", ")}`,
	);
}
