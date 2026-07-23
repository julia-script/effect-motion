import { Line2NodeMaterial, NormalBlending } from "three/webgpu";

/**
 * Thick lines — strokes with a real pixel width.
 *
 * @remarks
 * A plain three `Line` is always one pixel wide regardless of its material,
 * because that is all the GPU's line primitive offers. `Line2` draws
 * strokes as geometry instead, so a width in pixels means something.
 *
 * This module is a stable import point over three's addon subpaths, which
 * move between versions, plus one behavioral fix — see
 * {@link BlendedLine2NodeMaterial}. Construction and mutation are ordinary
 * synchronous three.
 */

type SetupDiffuseColorArgs = Parameters<Line2NodeMaterial["setupDiffuseColor"]>;

/**
 * A `Line2NodeMaterial` whose transparency actually blends.
 *
 * @remarks
 * Use this instead of three's `Line2NodeMaterial` for any stroke that is
 * not fully opaque.
 *
 * Upstream, a transparent fat line does not truly blend. It fakes
 * transparency by sampling a copy of the framebuffer's opaque content —
 * three's own comment says "transparency is not supported, yet". That copy
 * is a module-level singleton, recreated per render and shared by every
 * renderer on the page, which produces two problems: validation errors
 * about destroyed textures whenever more than one renderer is alive, and
 * wrong results against other translucent content, which the copy does not
 * contain.
 *
 * This subclass skips that branch during shader setup and uses ordinary
 * alpha blending, so a translucent stroke composites like every other
 * material. Drop it if upstream ever supports real fat-line transparency.
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
