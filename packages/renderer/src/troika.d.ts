// Minimal ambient typings for the troika typesetting internals we consume
// (no @types packages exist). Internal-only: nothing exported from this
// package references these types, so consumers never see them.

declare module "troika-three-text" {
	export interface TypesetGlyphData {
		readonly path: string;
		readonly pathBounds: [number, number, number, number];
	}

	export interface TypesetResult {
		readonly glyphIds: Array<number>;
		readonly glyphFontIndices: ReadonlyArray<number>;
		readonly glyphPositions: Float32Array;
		readonly fontSize: number;
		readonly fontData: ReadonlyArray<{
			readonly src: string;
			readonly unitsPerEm: number;
		}>;
		readonly glyphData: Record<string, Record<number, TypesetGlyphData>>;
		/** [minX, minY, maxX, maxY] of the full block, y-up, top at 0 */
		readonly blockBounds: [number, number, number, number];
		/** y of the first line's baseline (negative, y-up space) */
		readonly topBaseline: number;
	}

	export interface Typesetter {
		typeset(
			args: {
				readonly text: string;
				readonly font: ReadonlyArray<{ label: string; src: string }>;
				readonly fontSize: number;
				readonly sdfGlyphSize: number;
			},
			callback: (result: TypesetResult) => void,
		): void;
	}

	export const typesetterWorkerModule: {
		readonly onMainThread: {
			_getInitResult(): Promise<Typesetter>;
		};
	};
}

declare module "webgl-sdf-generator" {
	interface SdfGenerator {
		readonly javascript: {
			generate(
				width: number,
				height: number,
				path: string,
				viewBox: ReadonlyArray<number>,
				maxDistance: number,
				exponent: number,
			): Uint8Array;
		};
	}
	const factory: () => SdfGenerator;
	export default factory;
}
