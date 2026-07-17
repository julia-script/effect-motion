import type * as Projection from "../Projection";

/**
 * Depth-of-field circle of confusion (design D2 of camera-depth-of-field):
 * how much gaussian blur a paintable at `depth` receives under `camera`.
 * Pure arithmetic on frame data — deterministic by construction.
 */

/** defensive ceiling: no author intends a 100px blur; huge sigmas are bugs */
export const MAX_SIGMA = 64;
/** quantization step (px): paintables within a step share one blur pass */
export const SIGMA_STEP = 0.5;
/** below this, blur is visually nil — treat as sharp (no blur pass at all) */
export const SHARP_THRESHOLD = 0.25;

/**
 * Blur sigma for a paintable at view-space `depth`: zero at the focus plane,
 * growing with distance from it, scaled by aperture and focal length (longer
 * lens = shallower field). AE-flavored, not thin-lens-accurate — the contract
 * is the shape of the curve, not the constants.
 */
export const circleOfConfusion = (
	depth: number,
	camera: Projection.CameraView,
): number => {
	if (camera.aperture <= 0 || depth <= 0 || camera.focusDistance <= 0) {
		return 0;
	}
	const sigma =
		(camera.aperture *
			camera.focalLength *
			Math.abs(depth - camera.focusDistance)) /
		(depth * camera.focusDistance);
	return Math.min(sigma, MAX_SIGMA);
};

/**
 * Quantize a sigma so contiguous depth-sorted runs share blur passes: 0 for
 * visually-sharp values, otherwise the nearest step (never above the ceiling).
 * ponytail: 0.5px steps keep pass counts low and banding invisible; the
 * upgrade path is per-paintable exact sigma (one blur pass each) if a smooth
 * depth gradient ever shows stepping.
 */
export const quantizeSigma = (sigma: number): number =>
	sigma < SHARP_THRESHOLD
		? 0
		: Math.min(Math.round(sigma / SIGMA_STEP) * SIGMA_STEP, MAX_SIGMA);
