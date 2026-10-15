import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { NodeServices } from "@effect/platform-node";
import * as Gpu from "@effect-motion/three/Renderer";
import * as Target from "@effect-motion/three/RenderTarget";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Stream from "effect/Stream";
import * as Scene from "effect-motion/Scene";
import * as NodeRenderer from "../../src/node.js";
import * as Stroke from "../../src/Stroke.js";
import type * as Sync from "../../src/Sync.js";

const scenePath = process.argv[2];
const exportName = process.argv[4] ?? "scene";
const pixelRatio = Number(process.argv[5] ?? 1);
const destination = process.argv[3] ?? "/tmp/effect-motion-evidence";
if (scenePath !== undefined) {
	const program = Effect.gen(function* () {
		const loaded: Record<string, Scene.Scene> = yield* Effect.tryPromise(
			() => import(pathToFileURL(resolve(scenePath)).href),
		);
		const scene = loaded[exportName];
		if (scene === undefined)
			return yield* Effect.die(new Error(`Missing scene export ${exportName}`));
		const frames = yield* Scene.stream(scene, { frameRate: 10 }).pipe(
			Stream.runCollect,
		);
		const fs = yield* FileSystem.FileSystem;
		yield* fs.makeDirectory(destination, { recursive: true });
		const renderer = yield* NodeRenderer.make({
			width: scene.width,
			height: scene.height,
			pixelRatio,
		});
		const started = performance.now();
		const selected = new Set([
			0,
			Math.floor(frames.length / 2),
			frames.length - 1,
		]);
		for (const [index, frame] of frames.entries()) {
			const png = yield* NodeRenderer.renderToPng(renderer, frame);
			if (selected.has(index))
				yield* fs.writeFile(`${destination}/frame-${index}.png`, png);
			if (index === 0) {
				const masks: Array<Stroke.Stroke> = [];
				const targets: Array<{
					id: string;
					width: number;
					height: number;
					samples: number;
				}> = [];
				const gather = (sync: Sync.Sync): void => {
					for (const entry of sync.retained.values())
						entry.retained.object.traverse((object) => {
							const stroke = Stroke.fromObject(object);
							if (stroke?.target !== null && stroke !== undefined)
								masks.push(stroke);
						});
					for (const comp of sync.comps.values()) {
						if (comp.rt !== null)
							targets.push({
								id: comp.id,
								width: Target.width(comp.rt),
								height: Target.height(comp.rt),
								samples: comp.rt["~three.renderTarget"].samples,
							});
						gather(comp.sync);
					}
				};
				gather(renderer.sync);
				const observations = {
					output: {
						width: renderer.pixelWidth,
						height: renderer.pixelHeight,
						pixelRatio,
						samples: renderer.gpu["~three.renderer"].samples,
					},
					targets,
					masks: masks.map((stroke) => ({
						bounds: stroke.bounds,
						width: stroke.target === null ? 0 : Target.width(stroke.target),
						height: stroke.target === null ? 0 : Target.height(stroke.target),
						samples: stroke.target?.["~three.renderTarget"].samples,
					})),
				};
				yield* fs.writeFileString(
					`${destination}/pipeline.json`,
					JSON.stringify(observations, null, 2),
				);
				for (const [i, stroke] of masks.slice(0, 3).entries()) {
					const target = stroke.target;
					if (target === null) continue;
					const w = Target.width(target),
						h = Target.height(target);
					const rgba = yield* Gpu.readRenderTarget(renderer.gpu, target, w, h);
					yield* fs.writeFile(
						`${destination}/mask-${i}.png`,
						NodeRenderer.encodePng(rgba, w, h),
					);
				}
			}
		}
		yield* fs.writeFileString(
			`${destination}/timing.json`,
			JSON.stringify({
				frames: frames.length,
				elapsedMs: performance.now() - started,
			}),
		);
		const last = frames.at(-1);
		if (last !== undefined) {
			const fresh = yield* NodeRenderer.make({
				width: scene.width,
				height: scene.height,
				pixelRatio,
			});
			const png = yield* NodeRenderer.renderToPng(fresh, last);
			yield* fs.writeFile(`${destination}/fresh-last.png`, png);
		}
	});
	Effect.runPromise(
		program.pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
	)
		.then(() => process.exit(0))
		.catch((error) => {
			console.error(error);
			process.exitCode = 1;
		});
}
