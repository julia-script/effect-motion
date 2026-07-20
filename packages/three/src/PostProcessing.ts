import { dof } from "three/addons/tsl/display/DepthOfFieldNode.js";
import { pass, uniform } from "three/tsl";

/**
 * The post-processing surface the renderer uses: `RenderPipeline` plus the
 * TSL nodes for the depth-of-field chain. Node-graph construction is sync
 * and infallible, so these are plain re-exports — Effect enters at the
 * renderer lifecycle, not here.
 */

export { RenderPipeline } from "three/webgpu";
export { dof, pass, uniform };
