import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Color from "effect-motion/Color";
import * as Motion from "effect-motion/Motion";
import * as Scene from "effect-motion/Scene";
import * as THREE from "three/webgpu";
import { describe, expect, it } from "vitest";
import * as Paint from "../src/Paint.js";
import * as Sampling from "../src/Sampling.js";
import * as Stroke from "../src/Stroke.js";
import { unreachable } from "./support/raise.js";

describe("fractional coverage policy", () => {
	it("preserves exact fractional frame values across four seconds", async () => {
		const scene = Scene.make(function* () {
			const line = yield* Scene.instantiate("Line", { strokeWidth: 0.25 });
			yield* Motion.moveTo(line, { x: 1, y: 1 }, "4 seconds", "linear");
		});
		const frames = await Effect.runPromise(
			Scene.stream(scene, { frameRate: 60 }).pipe(Stream.runCollect),
		);
		const positions = frames.map((frame) => {
			const data = Object.values(frame.instances).find(
				(entry) => entry.data._tag === "Line",
			)?.data;
			if (data?._tag !== "Line") return unreachable();
			expect(data.strokeWidth).toBe(0.25);
			expect(data.position.x).toBe(data.position.y);
			return data.position.x;
		});
		expect(positions).toContain(0.25);
		expect(positions).toContain(0.5);
		expect(positions.at(-1)).toBe(1);
		expect(new Set(positions).size).toBeGreaterThanOrEqual(240);
	});
	it("preserves fractional silhouette bounds and uses integral raster extents only", () => {
		const stroke = Stroke.make();
		Stroke.update(
			stroke,
			[
				{
					points: [
						{ x: 0.25, y: 0.75, z: 0 },
						{ x: 10.25, y: 0.75, z: 0 },
					],
					closed: false,
				},
			],
			0.5,
			Color.white,
			1,
		);
		const box = stroke.occupancy.geometry.boundingBox ?? unreachable();
		expect(box.min.x).toBe(0);
		expect(box.max.x).toBe(10.5);
		expect(box.min.y).toBe(0.5);
		expect(box.max.y).toBe(1);
		expect(Sampling.extent(10.25, 1)).toBe(11);
		expect(Sampling.extent(10.25, 2)).toBe(21);
		expect(Sampling.samples).toBe(4);
		expect(Sampling.coverageScale).toBe(2);
		Stroke.dispose(stroke);
	});
	it("accounts for local depth and keeps crop views from multiplying density", () => {
		const camera = new THREE.PerspectiveCamera(90, 1, 1, 1000);
		camera.position.z = 100;
		const object = new THREE.Group();
		expect(Paint.density(object, camera, 200, 200, 1, 20, 20)).toBe(1);
		expect(Paint.density(object, camera, 200, 200, 2, 20, 20)).toBe(2);
		expect(
			Paint.density(object, camera, 200, 200, 1, 20, 20, { x: 0, y: 0, z: 50 }),
		).toBe(2);
		camera.setViewOffset(200, 200, 50, 50, 100, 100);
		expect(Paint.density(object, camera, 200, 200, 1, 20, 20)).toBe(1);
	});
});
