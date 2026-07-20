import { Line2NodeMaterial, NormalBlending } from "three/webgpu";

/**
 * Fat-line rendering: `Line2` (WebGPU variant) with `LineGeometry` and its
 * node material. Stable import point over three's addon subpaths;
 * construction and mutation are sync raw three.
 */

type SetupDiffuseColorArgs = Parameters<Line2NodeMaterial["setupDiffuseColor"]>;

/**
 * `Line2NodeMaterial` with real alpha blending. Upstream, a transparent fat
 * line does NOT blend: it samples `viewportOpaqueMipTexture()` — a
 * module-level singleton framebuffer copy — to fake transparency against
 * opaque content only ("transparency is not supported, yet"). That copy is
 * destroyed/recreated per render and shared across every renderer on the
 * page, spamming "destroyed texture used in a submit" validation errors
 * whenever more than one renderer (or the copy's resize) is in play, and it
 * blends wrongly against other translucent content besides.
 *
 * Here: skip the viewport-copy branch during shader setup and use ordinary
 * `NormalBlending`, so a translucent stroke alpha-blends like every other
 * material. Drop this subclass if upstream ever supports true fat-line
 * transparency.
 */
export class BlendedLine2NodeMaterial extends Line2NodeMaterial {
	constructor(...parameters: ConstructorParameters<typeof Line2NodeMaterial>) {
		super(...parameters);
		this.blending = NormalBlending;
	}

	override setupDiffuseColor(...args: SetupDiffuseColorArgs): void {
		// momentarily report opaque so the base setup skips its
		// viewportOpaqueMipTexture fake-transparency branch; the flag is
		// restored so the render pipeline still alpha-blends
		const transparent = this.transparent;
		this.transparent = false;
		super.setupDiffuseColor(...args);
		this.transparent = transparent;
	}
}

export { LineGeometry } from "three/addons/lines/LineGeometry.js";
export { Line2 } from "three/addons/lines/webgpu/Line2.js";
export { Line2NodeMaterial } from "three/webgpu";
