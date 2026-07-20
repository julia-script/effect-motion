import { PostProcessing, Tsl } from "@effect-motion/three";

/**
 * Custom depth-of-field: a level-0 scatter-as-gather blur over the scene
 * pass. Replaces three's TSL DepthOfFieldNode on BOTH render paths — that
 * node renders a single collapsed texel on its first frame in Chrome and
 * permanently under Dawn (its internal sampling; a plain pass-through and
 * this blur are both correct, probe-verified), and never resolves focus
 * reliably.
 *
 * CoC = |−viewZ − focus| / focus · strength (uv units), clamped. Each tap
 * is weighted by whether the TAP's own CoC reaches the center pixel
 * (scatter-as-gather): a naive equal-weight gather lets far-plane
 * background pixels — whose CoC is always at the clamp — pull sharp
 * geometry into a permanent max-radius halo that never resolves with
 * focus. Strength 0 (aperture 0) makes every tap land on the same texel —
 * an arithmetic identity, so one graph serves sharp and blurred frames.
 *
 * Taps sit on a Vogel spiral rotated per pixel by interleaved gradient
 * noise (the same trick three uses for soft shadows): a fixed disc shows
 * every tap as a shifted low-opacity copy of the scene, the jittered
 * spiral dissolves that into fine grain. Both the spiral and the noise are
 * pure functions of tap index / pixel coords — deterministic.
 *
 * ponytail: 49 fixed taps — slight grain at extreme radii; raise TAPS if a
 * DoF-heavy scene shows it. Tap radius is the CENTER pixel's CoC, so
 * blurred foregrounds don't bleed over in-focus neighbors — full bleed
 * needs a fixed max-radius search.
 */

export interface DofUniforms {
	readonly focus: { value: number };
	readonly strength: { value: number };
}

interface Node {
	sample(uv: unknown): Node;
	add(v: unknown): Node;
	sub(v: unknown): Node;
	mul(v: unknown): Node;
	div(v: unknown): Node;
	abs(): Node;
	negate(): Node;
	clamp(lo: number, hi: number): Node;
	cos(): Node;
	sin(): Node;
}

const TAPS = 96;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** [ox, oy, radius] on the unit disc; the leading center tap guarantees a
 * nonzero weight sum (its distance is 0, and CoC is never negative). */
const OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
	[0, 0, 0],
	...[...Array(TAPS).keys()].map((i) => {
		const r = Math.sqrt((i + 0.5) / TAPS);
		return [
			Math.cos(i * GOLDEN_ANGLE) * r,
			Math.sin(i * GOLDEN_ANGLE) * r,
			r,
		] as const;
	}),
];

/** ~1px at the docs player's height; keeps the smoothstep edges apart so an
 * in-focus pixel (dist 0) never hits the undefined edge0 == edge1 case. */
const FEATHER = 0.002;

/**
 * Build the blurred-scene node for a `PostProcessing.pass` of the world
 * scene. `uniforms.strength` is the CoC scale in uv units (0 = off).
 */
export const buildDofBlur = (
	scenePass: ReturnType<typeof PostProcessing.pass>,
	uniforms: DofUniforms,
): unknown => {
	const t = Tsl as unknown as {
		vec2: (...args: ReadonlyArray<unknown>) => Node;
		smoothstep: (edge0: unknown, edge1: unknown, x: unknown) => Node;
		perspectiveDepthToViewZ: (
			depth: unknown,
			near: unknown,
			far: unknown,
		) => Node;
		interleavedGradientNoise: (position: unknown) => Node;
		screenCoordinate: { xy: Node };
		screenUV: Node;
	};
	// _cameraNear/_cameraFar are the pass's auto-updated near/far uniforms —
	// private, but the only route to per-tap depth linearization (the public
	// getViewZNode is fixed at screenUV).
	const internals = scenePass as unknown as {
		_cameraNear: Node;
		_cameraFar: Node;
		getTextureNode(name: string): Node;
	};
	const color = scenePass.getTextureNode() as unknown as Node;
	const depth = internals.getTextureNode("depth");
	const focus = uniforms.focus as unknown as Node;
	const strength = uniforms.strength as unknown as Node;
	const cocOf = (viewZ: Node): Node =>
		viewZ.negate().sub(focus).abs().div(focus).mul(strength).clamp(0, 0.05);
	const centerCoc = cocOf(scenePass.getViewZNode() as unknown as Node);
	const centerColor = color.sample(t.screenUV);
	const angle = t
		.interleavedGradientNoise(t.screenCoordinate.xy)
		.mul(Math.PI * 2);
	const rotCos = angle.cos();
	const rotSin = angle.sin();
	let colorSum: Node | null = null;
	for (const [ox, oy, radius] of OFFSETS) {
		const dist = centerCoc.mul(radius);
		const rotated = t.vec2(
			rotCos.mul(ox).sub(rotSin.mul(oy)),
			rotSin.mul(ox).add(rotCos.mul(oy)),
		);
		const uv = t.screenUV.add(rotated.mul(centerCoc));
		const tapCoc = cocOf(
			t.perspectiveDepthToViewZ(
				depth.sample(uv),
				internals._cameraNear,
				internals._cameraFar,
			),
		);
		const weight = t.smoothstep(dist.sub(FEATHER), dist.add(FEATHER), tapCoc);
		// a rejected tap falls back to the center color instead of dropping out
		// of a renormalized sum — renormalizing boosts the few surviving taps
		// near a sharp rim (MSAA-tinted edge texels) into visible speckle
		const tap = color
			.sample(uv)
			.mul(weight)
			.add(centerColor.mul(weight.negate().add(1)));
		colorSum = colorSum === null ? tap : colorSum.add(tap);
	}
	return (colorSum as Node).div(OFFSETS.length);
};

export const makeDofUniforms = (): DofUniforms => ({
	focus: PostProcessing.uniform(1),
	strength: PostProcessing.uniform(0),
});
