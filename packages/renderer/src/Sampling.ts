/** Shared WebGPU quality policy. Four samples are supported by WebGPU. */
export const samples = 4;
/** Coverage is unioned at this density, then area-filtered for presentation. */
export const coverageScale = 2;

/** Raster allocation is integral; authored bounds and origins stay fractional. */
export const extent = (units: number, density: number): number =>
	Math.max(1, Math.ceil(units * density - 1e-7));

/** Quantize only the retained resource density, never the authored geometry. */
export const densityBucket = (density: number): number =>
	Math.max(1 / 16, Math.ceil(density * 16 - 1e-7) / 16);
