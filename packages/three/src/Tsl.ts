/**
 * The TSL (three shading language) surface consumers use to build node
 * materials — re-exported so downstream code has one import root. Node
 * graphs are sync and infallible; Effect stays at the renderer lifecycle.
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
