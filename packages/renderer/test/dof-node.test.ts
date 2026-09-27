import { Effect } from "effect";
import * as Stream from "effect/Stream";
import { Color, Entity as S, Scene } from "effect-motion";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import * as NodeRenderer from "../src/node.js";
import { unreachable } from "./support/raise.js";

// Depth of field through Dawn on a real GPU. Measured from readback, never
// byte-compared across environments — only within one device and process.

type AnyFrame = Parameters<typeof NodeRenderer.renderToPng>[1];

const W = 256;
const H = 128;

const withAperture = (frame: AnyFrame, aperture: number): AnyFrame => ({
	...frame,
	camera: { ...frame.camera, aperture },
});

/** A red rect at depth `z`, optionally pinned to the HUD or see-through. */
const rectAt = (z: number, hud = false, opacity = 1): Promise<AnyFrame> => {
	const scene = Scene.make(
		function* () {
			const rect = yield* Scene.instantiate("Rect", {
				position: S.vec3({ z }),
				width: 120,
				height: 80,
				opacity,
				fillColor: Color.rgba(255, 0, 0),
			});
			if (hud) {
				// a far world rect behind it, so DoF has something to blur
				yield* Scene.instantiate("Rect", {
					position: S.vec3({ z: -600 }),
					width: 400,
					height: 400,
					fillColor: Color.rgba(0, 0, 255),
				});
				yield* Scene.instantiate("Hud", { children: [rect] });
			}
			yield* Scene.tick;
		},
		{ width: W, height: H, backgroundColor: Color.rgba(0, 0, 0) },
	);
	return Effect.runPromise(Scene.stream(scene).pipe(Stream.runCollect)).then(
		(chunk) => [...chunk].at(-1) ?? unreachable(),
	);
};

/** An opaque blue card at depth `z` over a white far wall. */
const cardOverWall = (z: number): Promise<AnyFrame> => {
	const scene = Scene.make(
		function* () {
			yield* Scene.instantiate("Rect", {
				position: S.vec3({ z: -300 }),
				width: 2000,
				height: 2000,
				strokeWidth: 0,
				fillColor: Color.rgba(255, 255, 255),
			});
			yield* Scene.instantiate("Rect", {
				position: S.vec3({ z }),
				width: 100,
				height: 60,
				strokeWidth: 0,
				fillColor: Color.rgba(0, 0, 255),
			});
			yield* Scene.tick;
		},
		{ width: W, height: H, backgroundColor: Color.rgba(0, 0, 0) },
	);
	return Effect.runPromise(Scene.stream(scene).pipe(Stream.runCollect)).then(
		(chunk) => [...chunk].at(-1) ?? unreachable(),
	);
};

/** Red channel of the image's centre pixel. */
const centreRed = (png: Uint8Array): number => {
	const img = PNG.sync.read(Buffer.from(png));
	const x = Math.floor(img.width / 2);
	const y = Math.floor(img.height / 2);
	return img.data[(y * img.width + x) * 4] ?? unreachable();
};

/** Render frames in order on ONE renderer; returns each PNG + the renderer. */
const render = (...frames: ReadonlyArray<AnyFrame>) =>
	Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const renderer = yield* NodeRenderer.make({ width: W, height: H });
				const pngs: Array<Uint8Array> = [];
				for (const frame of frames) {
					pngs.push(yield* NodeRenderer.renderToPng(renderer, frame));
				}
				return {
					pngs,
					dofBuilt: renderer.dofChain !== null,
					reversedZ: renderer.gpu["~three.renderer"].reversedDepthBuffer,
				};
			}),
		),
	);

/**
 * Horizontal edge spread through the image's middle row: how many pixels the
 * red channel spends between 10% and 90% of its range. A sharp edge pair is
 * ~2 px; blur widens it by roughly the CoC diameter per edge.
 */
const edgeSpread = (png: Uint8Array): number => {
	const img = PNG.sync.read(Buffer.from(png));
	const row = Math.floor(img.height / 2);
	const red = Array.from(
		{ length: img.width },
		(_, x) => img.data[(row * img.width + x) * 4] ?? 0,
	);
	const lo = Math.min(...red);
	const hi = Math.max(...red);
	expect(hi - lo).toBeGreaterThan(100); // the rect is on the row
	return red.filter((v) => v > lo + 0.1 * (hi - lo) && v < lo + 0.9 * (hi - lo))
		.length;
};

/**
 * The tilted-plane docs example's set, framed for 480×270 (its 1920-wide
 * focal length): a floor of flat tiles receding from a raised camera, posts
 * and a disc standing on it. Two of the example's shots: its first frame, and
 * one after the dolly, orbit and focus pull.
 */
const tiltedFloorShots = (): Promise<[AnyFrame, AnyFrame]> => {
	const scene = Scene.make(
		function* () {
			for (let row = 0; row < 22; row++) {
				for (let col = -6; col < 6; col++) {
					yield* Scene.instantiate("Rect", {
						position: S.vec3({
							x: (col + 0.5) * 400,
							y: -400,
							z: 1600 - (row + 0.5) * 400,
						}),
						rotation: S.vec3({ x: -Math.PI / 2 }),
						width: 400,
						height: 400,
						strokeWidth: 0,
						fillColor:
							(row + col) % 2 === 0
								? Color.rgba(255, 93, 115)
								: Color.rgba(255, 232, 214),
					});
				}
			}
			for (let i = 0; i < 9; i++) {
				for (const side of [-1, 1]) {
					yield* Scene.instantiate("Rect", {
						position: S.vec3({ x: side * 1300, y: 50, z: 1200 - i * 900 }),
						width: 260,
						height: 900,
						strokeWidth: 0,
						fillColor:
							i % 2 === 0 ? Color.rgba(255, 183, 3) : Color.rgba(33, 158, 188),
					});
				}
			}
			yield* Scene.instantiate("Circle", {
				position: S.vec3({ y: -140, z: -1400 }),
				radius: 260,
				strokeWidth: 0,
				fillColor: Color.rgba(58, 12, 163),
			});
			yield* Scene.tick;
		},
		{ width: 480, height: 270, backgroundColor: Color.rgba(27, 27, 58) },
	);
	const shot = (
		frame: AnyFrame,
		y: number,
		z: number,
		focusDistance: number,
	): AnyFrame => ({
		...frame,
		camera: {
			...frame.camera,
			y,
			z,
			focalLength: (480 * 50) / 36,
			focusDistance,
			aperture: 60,
			poiX: 0,
			poiY: -140,
			poiZ: -1400,
		},
	});
	return Effect.runPromise(Scene.stream(scene).pipe(Stream.runCollect)).then(
		(chunk) => {
			const frame = [...chunk].at(-1) ?? unreachable();
			return [shot(frame, 700, 2600, 4087), shot(frame, 377, 1063, 2516)];
		},
	);
};

/** Render frames in order on ONE renderer at a pixel ratio; returns the PNGs. */
const renderAt = (pixelRatio: number, ...frames: ReadonlyArray<AnyFrame>) =>
	Effect.runPromise(
		Effect.scoped(
			Effect.gen(function* () {
				const first = frames[0] ?? unreachable();
				const renderer = yield* NodeRenderer.make({
					width: first.width,
					height: first.height,
					pixelRatio,
				});
				const pngs: Array<Uint8Array> = [];
				for (const frame of frames) {
					pngs.push(yield* NodeRenderer.renderToPng(renderer, frame));
				}
				return pngs;
			}),
		),
	);

/**
 * A parent that mounts a child comp (Scene.play) whose own camera opens its
 * lens to `aperture`; the child holds a red rect off its focus plane.
 */
const compWithChildAperture = (aperture: number): Promise<AnyFrame> => {
	const child = Scene.make(
		function* () {
			yield* Scene.instantiate("Rect", {
				position: S.vec3({ z: -300 }),
				width: 120,
				height: 80,
				fillColor: Color.rgba(255, 0, 0),
			});
			const camera = yield* Scene.camera;
			yield* Scene.update(camera, (props) => ({ ...props, aperture }));
			yield* Scene.tick;
		},
		{ width: W, height: H, backgroundColor: Color.rgba(0, 0, 0) },
	);
	const parent = Scene.make(
		function* () {
			const handle = yield* Scene.play(child);
			yield* handle.finished;
		},
		{ width: W, height: H, backgroundColor: Color.rgba(0, 0, 0) },
	);
	return Effect.runPromise(Scene.stream(parent).pipe(Stream.runCollect)).then(
		(chunk) => [...chunk].at(-1) ?? unreachable(),
	);
};

describe("depth of field (headless Dawn)", () => {
	it("aperture 0 never builds the DoF chain and renders the plain path", async () => {
		const frame = await rectAt(-300);
		const plain = await render(frame);
		expect(plain.dofBuilt).toBe(false);
		// after the chain was built and used, aperture 0 is back on the plain
		// pipeline: same device, same frame → the same pixels
		const after = await render(withAperture(frame, 10), frame);
		expect(after.dofBuilt).toBe(true);
		const [blurred, back] = after.pngs;
		expect(Buffer.from(back ?? unreachable())).toEqual(
			Buffer.from(plain.pngs[0] ?? unreachable()),
		);
		expect(edgeSpread(blurred ?? unreachable())).toBeGreaterThan(
			edgeSpread(back ?? unreachable()) + 2,
		);
		// the depth DoF lends see-through layers is handed back: aperture 0
		// after a DoF frame matches a renderer that never drew one
		const seeThrough = await rectAt(-300, false, 0.5);
		const [fresh] = (await render(seeThrough)).pngs;
		const [, restored] = (
			await render(withAperture(seeThrough, 10), seeThrough)
		).pngs;
		expect(Buffer.from(restored ?? unreachable())).toEqual(
			Buffer.from(fresh ?? unreachable()),
		);
	}, 60_000);

	it("a shape on the focus plane stays sharp with aperture > 0", async () => {
		const frame = await rectAt(0);
		const { pngs } = await render(frame, withAperture(frame, 10));
		const [sharp, focused] = pngs;
		expect(
			Math.abs(
				edgeSpread(focused ?? unreachable()) -
					edgeSpread(sharp ?? unreachable()),
			),
		).toBeLessThanOrEqual(1);
	}, 60_000);

	it("off-plane shapes blur, the farther from focus more", async () => {
		const [near, far] = await Promise.all([rectAt(-150), rectAt(-400)]);
		const { pngs } = await render(
			near,
			withAperture(near, 10),
			withAperture(far, 10),
		);
		const [sharp, nearBlur, farBlur] = pngs.map((p) => edgeSpread(p));
		// CoC ≈ 10·|d − F|/d px: ~3 px at z −150, ~5.3 px at z −400
		expect(nearBlur).toBeGreaterThan((sharp ?? 0) + 2);
		expect(farBlur).toBeGreaterThan((nearBlur ?? 0) + 2);
	}, 60_000);

	it("depth reads correctly through the reversed-Z buffer", async () => {
		// both sides of the focus plane blur: a sign or linearization slip in
		// reading reversed depth would blur one side and not the other
		const [front, focus, behind] = await Promise.all([
			rectAt(150),
			rectAt(0),
			rectAt(-150),
		]);
		const { pngs, reversedZ } = await render(
			...[front, focus, behind].flatMap((f) => [f, withAperture(f, 10)]),
		);
		expect(reversedZ).toBe(true);
		const [
			frontSharp,
			frontBlur,
			focusSharp,
			focused,
			behindSharp,
			behindBlur,
		] = pngs.map((p) => edgeSpread(p));
		// CoC ≈ 10·|d − F|/d px: ~7 px in front (d ≈ 206), 0 on the plane,
		// ~3 px behind (d ≈ 506)
		expect(frontBlur).toBeGreaterThan((frontSharp ?? 0) + 4);
		expect(Math.abs((focused ?? 0) - (focusSharp ?? 0))).toBeLessThanOrEqual(1);
		expect(behindBlur).toBeGreaterThan((behindSharp ?? 0) + 2);
		expect(frontBlur).toBeGreaterThan(behindBlur ?? 0);
	}, 60_000);

	it("a see-through shape on the focus plane stays sharp", async () => {
		// see-through layers write no depth on the plain path; without the
		// depth DoF lends them, this took the empty background's far-field
		// blur (a 28 px edge spread)
		const frame = await rectAt(0, false, 0.5);
		const { pngs } = await render(frame, withAperture(frame, 10));
		const [sharp, focused] = pngs;
		expect(
			Math.abs(
				edgeSpread(focused ?? unreachable()) -
					edgeSpread(sharp ?? unreachable()),
			),
		).toBeLessThanOrEqual(1);
	}, 60_000);

	it("an opaque near shape stays opaque at a few px of CoC", async () => {
		// d ≈ 206, focus ≈ 356: CoC ≈ 0.73 · aperture px. Before the near
		// gather reached c + 0.5, ~1–10 px CoC let the wall show through
		// (red 52–65 of 255 at 1.5–3.6 px).
		const frame = await cardOverWall(150);
		const { pngs } = await render(
			...[2, 3, 5, 8].map((aperture) => withAperture(frame, aperture)),
		);
		for (const png of pngs) {
			expect(centreRed(png)).toBeLessThanOrEqual(8);
		}
	}, 60_000);

	it("HUD content stays sharp with DoF on", async () => {
		// off the focus plane (focus rests at z 0), so it WOULD blur if the HUD
		// went through DoF
		const frame = await rectAt(-300, true);
		const { pngs, dofBuilt } = await render(frame, withAperture(frame, 20));
		expect(dofBuilt).toBe(true);
		const [off, on] = pngs;
		expect(
			Math.abs(
				edgeSpread(on ?? unreachable()) - edgeSpread(off ?? unreachable()),
			),
		).toBeLessThanOrEqual(1);
	}, 60_000);

	it("a comp renders sharp: its own camera's aperture is not applied", async () => {
		// the decision recorded in the comp-camera openspec change: the comp
		// layer takes the PARENT camera's DoF at its own depth, never its own
		const [open, closed] = await Promise.all([
			compWithChildAperture(20),
			compWithChildAperture(0),
		]);
		const { pngs, dofBuilt } = await render(open, closed);
		expect(dofBuilt).toBe(false);
		expect(centreRed(pngs[0] ?? unreachable())).toBeGreaterThan(200);
		expect(Buffer.from(pngs[0] ?? unreachable())).toEqual(
			Buffer.from(pngs[1] ?? unreachable()),
		);
	}, 60_000);

	it("a frame does not depend on the frames rendered before it", async () => {
		// Regression: the peeled layer once kept state across renders, so after
		// a camera move and focus pull a frame came out differently than the
		// same frame on a fresh renderer (blue fringes on the blurred floor).
		const [a, b] = await tiltedFloorShots();
		const [, afterA] = await renderAt(7, a, b);
		const [fresh] = await renderAt(7, b);
		const x = PNG.sync.read(Buffer.from(afterA ?? unreachable())).data;
		const y = PNG.sync.read(Buffer.from(fresh ?? unreachable())).data;
		// a count, not toEqual: a diff of two 25 MB buffers takes minutes
		expect(x.filter((v, i) => v !== y[i]).length).toBe(0);
	}, 60_000);
});
