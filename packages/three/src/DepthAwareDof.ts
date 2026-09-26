/**
 * Depth-aware depth of field for three.js WebGPU: a drop-in alternative to
 * three's `dof()` with a physical thin-lens circle of confusion (CoC).
 *
 * @remarks
 * Ported verbatim (algorithm and constants) from the standalone
 * `DepthAwareDofNode.ts` prototype; only typing and lint conventions differ.
 * Exposed as `PostProcessing.depthAwareDof`.
 *
 * ```ts
 * const scenePass = PostProcessing.pass(scene, camera);
 * const dofNode = PostProcessing.depthAwareDof(scenePass, {
 *   focusDistance: 500, // world units along the view axis
 *   aperture: 12.5, // lens radius, world units
 * });
 * const pipeline = PostProcessing.makePipeline(renderer, dofNode);
 * dofNode.focusDistance.value = 300; // parameters are uniforms: change any time
 * ```
 *
 * Parameters (each a number or a float `uniform()`; exposed as uniforms on the
 * returned node):
 * - `focusDistance`: distance of the sharp plane, world units.
 * - `aperture`: lens radius, world units. A point at distance d blurs to a
 *   disc of radius aperture · |d − focus| / d · H / (2 · focus · tan(fov / 2))
 *   px (H = render height in px), see {@link cocRadiusPx}.
 * - `maxBlurPx` (default 30): CoC radius cap in render-target px. Keep it
 *   ≤ (REACH − 1) · TILE = 48, the reach of the near-field tile dilation.
 *   The uncapped CoC scales with H, so it looks the same at any pixel ratio;
 *   the cap does not (at DPR 2, 30 caps at 15 CSS px). It is not scaled by
 *   DPR internally because 30 · 2 would pass the 48 px limit.
 *
 * Requirements: WebGPURenderer + RenderPipeline, a PerspectiveCamera, opaque
 * geometry. Resize, pixel ratio and camera near/far/fov/zoom changes are
 * picked up every frame; no rebuild is needed.
 *
 * Known limits:
 * - Transparent surfaces are not handled (the CoC comes from the depth buffer).
 * - The scene is rendered twice per frame: the second, depth-peeled pass finds
 *   surfaces hidden behind near / sharp objects (≈ 20–50% of the effect cost).
 * - A nearer blurred surface still composites with a hard step over a surface
 *   whose own CoC is > 1 px (a depth-gap split would fix it).
 */
import * as TSL from "three/tsl";
import type { Camera, Node, Object3D, PassNode } from "three/webgpu";
import {
	HalfFloatType,
	NearestFilter,
	NodeUpdateType,
	Vector3,
} from "three/webgpu";
import type { Pass } from "./PostProcessing.js";

/** Loose TSL value: just the chainable ops used here. */
interface V {
	x: V;
	y: V;
	z: V;
	rgb: V;
	a: V;
	add(b: V | number): V;
	sub(b: V | number): V;
	mul(b: V | number): V;
	div(b: V | number): V;
	greaterThan(b: V | number): V;
	lessThan(b: V | number): V;
	and(b: V): V;
	or(b: V): V;
	assign(b: V | number): void;
	addAssign(b: V | number): void;
	toVar(): V;
	toInspector(name: string): V;
}

interface U extends V {
	value: number;
	onRenderUpdate(callback: () => number): U;
}

interface Tex extends V {
	sample(uv: V): V;
	setResolutionScale(s: number): void;
	updateBeforeType: string;
	renderTarget: { texture: { minFilter: number; magFilter: number } };
}

type Loop = (
	a: number,
	b: number | ((o: { i: V }) => void),
	c?: unknown,
) => void;

// Shallow signatures: full three/tsl overloads hang tsc.
const t = TSL as unknown as {
	Fn: (f: () => V) => () => V;
	Loop: Loop;
	If: (cond: V, f: () => void) => void;
	float: (n: V | number) => V;
	vec2: (x: V | number, y?: V | number) => V;
	vec4: (rgb: V, a: V | number) => V;
	uv: () => V;
	textureSize: (tex: Tex) => V;
	rtt: (node: V, w: null, h: null, opts: object) => Tex;
	min: (a: V | number, b: V | number) => V;
	max: (a: V | number, b: V | number) => V;
	clamp: (x: V, lo: number, hi: number) => V;
	abs: (x: V) => V;
	select: (c: V, a: V | number, b: V | number) => V;
	mix: (a: V, b: V, t: V) => V;
	negate: (x: V) => V;
	fract: (x: V) => V;
	cos: (x: V) => V;
	sin: (x: V) => V;
	uniformArray: (values: Vector3[], type: string) => { element(i: V): V };
	uniform: (value: number) => U;
	pass: (scene: Object3D, camera: Camera) => PassNode;
	context: (value: object) => PassNode["contextNode"];
	Discard: (cond: V) => void;
	perspectiveDepthToViewZ: (depth: V, near: V, far: V) => V;
	builtin: (name: string) => V;
	screenUV: V;
	cameraNear: V;
	cameraFar: V;
};

const NEAR_TAPS = 64;
const FAR_TAPS = 48;
/** Near-CoC tile size (px) and dilation reach (tiles): covers ≥ (REACH − 1) · TILE px. */
const TILE = 16;
const REACH = 4;
/** A source never spreads over less than ~one pixel (π·0.5² ≈ 0.8 px²). */
const MIN_AREA = 0.25;
/** Relative view-depth gap a fragment needs to count as behind the first layer. */
const PEEL_EPS = 1e-3;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** A float parameter: a plain number or a `uniform()` node. */
export type FloatParam = number | (Node & { value: number });

export interface DepthAwareDofOptions {
	focusDistance: FloatParam;
	aperture: FloatParam;
	maxBlurPx?: FloatParam;
}

/** The output node, with its parameters as uniforms (set `.value`). */
export type DepthAwareDofNode = Node & {
	focusDistance: Node & { value: number };
	aperture: Node & { value: number };
	maxBlurPx: Node & { value: number };
};

/** Screen px per world unit on the focus plane (perspective camera). */
export function pxPerUnitAtFocus(
	camera: { fov: number; zoom: number },
	focusDistance: number,
	height: number,
): number {
	return (
		height /
		(2 * focusDistance * (Math.tan((camera.fov * Math.PI) / 360) / camera.zoom))
	);
}

/**
 * Physical thin-lens CoC radius (px) at view distance d = −viewZ: a lens of
 * radius `aperture` focused at `focusDistance` images the point as a disc of
 * world radius aperture · |d − focus| / d on the focus plane, projected by
 * `pxPerUnit` ({@link pxPerUnitAtFocus}). Near blur grows without bound as
 * d → 0; far blur saturates at aperture · pxPerUnit.
 */
export function cocRadiusPx(
	d: number,
	focusDistance: number,
	aperture: number,
	pxPerUnit: number,
): number {
	return ((aperture * Math.abs(d - focusDistance)) / d) * pxPerUnit;
}

const asUniform = (p: FloatParam) =>
	(typeof p === "number" ? t.uniform(p) : p) as unknown as U;

function packedTarget(node: V, scale = 1) {
	const tex = t.rtt(node, null, null, { type: HalfFloatType });
	tex.setResolutionScale(scale);
	tex.updateBeforeType = NodeUpdateType.FRAME; // once per frame, not per consumer
	tex.renderTarget.texture.minFilter = NearestFilter;
	tex.renderTarget.texture.magFilter = NearestFilter;
	return tex;
}

/** Vogel disc tap i of n at radius R: [screen offset px, radius px]. */
function vogel(i: V, n: number, radius: V, rot: V): [V, V] {
	// Unit-disc taps precomputed (x, y, r): no per-tap sqrt / sincos.
	const taps = Array.from({ length: n }, (_, k) => {
		const r = Math.sqrt((k + 0.5) / n);
		return new Vector3(r * Math.cos(k * GOLDEN), r * Math.sin(k * GOLDEN), r);
	});
	const tap = t.uniformArray(taps, "vec3").element(i);
	const off = t.vec2(
		tap.x.mul(rot.x).sub(tap.y.mul(rot.y)),
		tap.x.mul(rot.y).add(tap.y.mul(rot.x)),
	);
	return [off.mul(radius), tap.z.mul(radius)];
}

/**
 * Depth-aware gather DOF on a continuous per-pixel signed CoC s (px, < 0 near).
 *
 * - Near field: scatter-as-gather over a disc sized by the dilated near-CoC
 *   tile max, so blurred foreground spreads over sharp pixels behind it. Each
 *   near tap covers R²/N px and spreads over π c², giving coverage α.
 * - Far field: disc of the pixel's own CoC; a tap reaches with min(s_q, s_p),
 *   so sharp (s ≈ 0) neighbours mask themselves out and the rest is
 *   renormalized — the hidden background is filled from its visible part.
 * - Hidden surfaces come from a depth-peeled second layer: behind near pixels,
 *   and behind a missed front tap across a depth jump.
 */
export function depthAwareDof(
	pass: Pass,
	{ focusDistance, aperture, maxBlurPx = 30 }: DepthAwareDofOptions,
): DepthAwareDofNode {
	const scenePass: PassNode = pass["~three.pass"];
	const focus = asUniform(focusDistance);
	const lensRadius = asUniform(aperture);
	const maxBlur = asUniform(maxBlurPx);
	const camera = scenePass.camera as Camera & { fov: number; zoom: number };
	// CoC px per unit of |d − focus| / d, as a fraction of maxBlur. Per render:
	// follows resize / pixel ratio (the pass target) and camera fov / zoom.
	const cocScale = t
		.uniform(0)
		.onRenderUpdate(
			() =>
				(lensRadius.value *
					pxPerUnitAtFocus(
						camera,
						focus.value,
						scenePass.renderTarget.height,
					)) /
				maxBlur.value,
		);
	const side = (d: V, far: boolean) =>
		t.min(
			t
				.max(far ? d.sub(focus) : focus.sub(d), 0)
				.div(d)
				.mul(cocScale),
			1,
		);

	const beauty = scenePass.getTextureNode() as unknown as V;
	const distance = t.negate(scenePass.getViewZNode() as unknown as V);
	const signedCoc = (d: V) => side(d, true).sub(side(d, false)).mul(maxBlur);
	const signed = signedCoc(distance);

	const packed = packedTarget(t.vec4(beauty.rgb, signed));

	// Second depth layer: re-render, discarding fragments at or in front of the
	// first layer, so hidden surfaces behind near / sharp objects are known.
	// Fragments within 1 px CoC of the first layer are the same surface (e.g. a
	// Line2's overlapping segment caps) and are peeled too, else it counts twice.
	const frontZ = t.perspectiveDepthToViewZ(
		(scenePass.getTextureNode("depth") as unknown as Tex).sample(t.screenUV),
		t.cameraNear,
		t.cameraFar,
	);
	const back = t.pass(scenePass.scene, scenePass.camera);
	// Rasterized depth, not positionView: Line2's positionView is its unit quad.
	// fragCoord is declared by the screenUV lookup above.
	const fragZ = t.perspectiveDepthToViewZ(
		t.builtin("fragCoord.z"),
		t.cameraNear,
		t.cameraFar,
	);
	back.contextNode = t.context({
		getOutput: (output: V) => {
			t.Discard(
				fragZ
					.greaterThan(frontZ.mul(1 + PEEL_EPS))
					.or(
						t
							.abs(signedCoc(t.negate(fragZ)).sub(signedCoc(t.negate(frontZ))))
							.lessThan(1),
					),
			);
			return output;
		},
	});
	// `packed` first so the front pass renders (once per frame) before the peel;
	// otherwise the peel would trigger it nested, inside the peel context.
	const backPacked = packedTarget(
		t.vec4(
			packed
				.sample(t.uv())
				.a.mul(0)
				.add((back.getTextureNode() as unknown as V).rgb),
			signedCoc(t.negate(back.getViewZNode() as unknown as V)),
		),
	);
	const texel = t.vec2(1).div(t.vec2(t.textureSize(packed)));

	// Near CoC max per TILE² block (two 4×4 max reductions: short serial loops
	// keep the low-res passes from being latency-bound), then dilated below.
	const maxDown = (src: Tex, value: (q: V) => V, scale: number) => {
		const srcTexel = t.vec2(1).div(t.vec2(t.textureSize(src)));
		return packedTarget(
			t.Fn(() => {
				const m = t.float(0).toVar();
				t.Loop(4, 4, ({ i, j }: { i: V; j: V }) => {
					const off = t.vec2(t.float(i), t.float(j)).sub(1.5);
					m.assign(t.max(m, value(src.sample(t.uv().add(off.mul(srcTexel))))));
				});
				return m;
			})(),
			scale,
		);
	};
	const tileMax = maxDown(
		maxDown(packed, (q) => t.negate(q.a), 1 / 4),
		(q) => q.x,
		1 / TILE,
	);
	const tileTexel = t.vec2(1).div(t.vec2(t.textureSize(tileMax)));
	const nearTile = packedTarget(
		t.Fn(() => {
			const m = t.float(0).toVar();
			const n = 2 * REACH + 1;
			t.Loop(n, n, ({ i, j }: { i: V; j: V }) => {
				const off = t.vec2(t.float(i), t.float(j)).sub(REACH);
				m.assign(t.max(m, tileMax.sample(t.uv().add(off.mul(tileTexel))).x));
			});
			return m;
		})(),
		1 / TILE,
	);

	const output = t
		.Fn(() => {
			const uv = t.uv();
			const center = packed.sample(uv);
			// Per-pixel pattern rotation (interleaved gradient noise): trades the
			// tap pattern's banding for fine noise.
			const px = uv.mul(t.vec2(t.textureSize(packed)));
			const ign = t.fract(
				t.fract(px.x.mul(0.06711056).add(px.y.mul(0.00583715))).mul(52.9829189),
			);
			const angle = ign.mul(2 * Math.PI);
			const rot = t.vec2(t.cos(angle), t.sin(angle));
			const sP = center.a;

			// Near field
			const nearR = nearTile.sample(uv).x;
			const tapArea = nearR.mul(nearR).div(NEAR_TAPS);
			const spread = (c: V) => t.max(t.max(c.mul(c), tapArea), MIN_AREA);
			// Centre tap: a near pixel covers itself (α ≈ 1 when it is nearly sharp).
			// Only a surface blurred by more than 1 px counts as near: a barely-near
			// one is in focus (CoC < 1 px), so nearer blur composites over it via the
			// far path instead of being normalized together with its centre tap.
			// ponytail: a hard 1 px cut; a [0.5, 1.5] ramp scored slightly worse.
			const nearP = sP.lessThan(-1);
			const cP = t.max(t.negate(sP), 0);
			const w0 = t.select(nearP, t.float(1).div(spread(cP)), 0);
			const nearSum = center.rgb.mul(w0).toVar();
			const nearW = w0.toVar();
			const alphaSum = w0.mul(t.max(tapArea, MIN_AREA)).toVar();
			t.If(nearR.greaterThan(0.5), () => {
				t.Loop(NEAR_TAPS, ({ i }) => {
					const [off, r] = vogel(i, NEAR_TAPS, nearR, rot);
					const q = packed.sample(uv.add(off.mul(texel)));
					const c = t.negate(q.a);
					const isNear = c.greaterThan(0);
					const reach = t.clamp(c.sub(r).add(0.5), 0, 1);
					const w = t.select(isNear, reach.div(spread(c)), 0);
					nearSum.addAssign(q.rgb.mul(w));
					nearW.addAssign(w);
					alphaSum.addAssign(w.mul(tapArea));
				});
			});
			const alpha = t.min(alphaSum, 1);
			const nearColor = nearSum.div(t.max(nearW, 1e-6));

			// Far / focus field of the scene with near surfaces peeled away: per
			// tap, the front layer if it reaches p, else the layer hidden behind it.
			// Layer 2 can itself be near (a line behind a nearer disc): it is then
			// blurred by its own CoC |sB| too, near layer-2 taps included.
			const bP = t.select(nearP, backPacked.sample(uv), center);
			const sB = bP.a;
			const cB = t.abs(sB);
			const farColor = bP.rgb.toVar();
			t.If(cB.greaterThan(0.5), () => {
				const farArea = t.max(cB.mul(cB).div(FAR_TAPS), MIN_AREA);
				const spreadF = (c: V) => t.max(c.mul(c), farArea);
				const sum = bP.rgb.div(spreadF(cB)).toVar();
				const wSum = t.float(1).div(spreadF(cB)).toVar();
				t.Loop(FAR_TAPS, ({ i }) => {
					const [off, r] = vogel(i, FAR_TAPS, cB, rot);
					const quv = uv.add(off.mul(texel));
					const q1 = packed.sample(quv);
					const c1 = t.min(t.abs(q1.a), cB);
					// In front of p's hidden surface (left to the near field): any near
					// tap, or when that surface is itself near, a clearly nearer one.
					const inFront = q1.a.lessThan(t.select(sB.lessThan(0), sB.sub(1), 0));
					const reach1 = t.select(
						inFront,
						0,
						t.clamp(c1.sub(r).add(0.5), 0, 1),
					);
					const w1 = reach1.div(spreadF(c1));
					sum.addAssign(q1.rgb.mul(w1));
					wSum.addAssign(w1);
					// A missed front tap only reveals layer 2 across a depth jump; on a
					// continuous surface (s changes slowly with r) the ray hits it anyway.
					const jump = t.select(
						inFront,
						1,
						t.clamp(cB.sub(c1).div(t.max(r, 1)).sub(0.25).mul(4), 0, 1),
					);
					const miss = t.float(1).sub(reach1).mul(jump);
					t.If(miss.greaterThan(0), () => {
						const q2 = backPacked.sample(quv);
						const c2 = t.min(t.abs(q2.a), cB);
						const reach2 = t.select(
							q2.a.lessThan(0).and(sB.greaterThan(0)),
							0,
							t.clamp(c2.sub(r).add(0.5), 0, 1),
						);
						const w2 = miss.mul(reach2).div(spreadF(c2));
						sum.addAssign(q2.rgb.mul(w2));
						wSum.addAssign(w2);
					});
				});
				farColor.assign(sum.div(t.max(wSum, 1e-6)));
			});

			return t.vec4(t.mix(farColor, nearColor, alpha), 1);
		})()
		.toInspector("Composite") as unknown as Node;
	return Object.assign(output, {
		focusDistance: focus,
		aperture: lensRadius,
		maxBlurPx: maxBlur,
	}) as unknown as DepthAwareDofNode;
}
