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

/** A red rect at depth `z`, optionally pinned to the HUD. */
const rectAt = (z: number, hud = false): Promise<AnyFrame> => {
	const scene = Scene.make(
		function* () {
			const rect = yield* Scene.instantiate("Rect", {
				position: S.vec3({ z }),
				width: 120,
				height: 80,
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
				return { pngs, dofBuilt: renderer.dofChain !== null };
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
});
