/**
 * TSL — three's shading language, for building node materials and shader
 * graphs.
 *
 * @remarks
 * Re-exported so downstream code has a single import root for the subset
 * this project uses, rather than reaching into `three/tsl` from a dozen
 * places.
 *
 * These are pure description: building a node graph runs no GPU work and
 * cannot fail, so nothing here is an Effect. Effect enters when a graph is
 * eventually rendered.
 *
 * Note that node types are deliberately not re-exported — three's published
 * node types expand into unions large enough to stall a type check, so
 * consumers declare the minimal shape they use. See `PostProcessing`.
 */

export {
	attribute,
	float,
	fwidth,
	interleavedGradientNoise,
	mix,
	perspectiveDepthToViewZ,
	positionGeometry,
	screenCoordinate,
	screenUV,
	smoothstep,
	texture,
	uniform,
	vec2,
	vec3,
	vec4,
} from "three/tsl";
