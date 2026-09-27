import * as NodeRenderer from "@effect-motion/renderer/node";
import * as Effect from "effect/Effect";
import { Color } from "effect-motion";
import type { Frame } from "effect-motion/Scene";

/**
 * Headless stills: already-produced frames become PNG bytes, one per frame,
 * or one contact-sheet PNG tiling them all.
 *
 * Frame selection lives upstream — pass exactly the frames you want. One
 * renderer per call, sized from the first frame; frames render serially
 * (same as `Video.render`: the retained scene is shared state).
 */

type AnyFrame = Frame<unknown>;

// frames carry their font/image loaders only as a phantom type; the renderer
// reads the loaders from context at runtime (a missing one is a defect), so
// surface them as the effect's requirement — widening from never, no cast
const requires = <Resources, A, E>(
	_frames: ReadonlyArray<Frame<Resources>>,
	effect: Effect.Effect<A, E>,
): Effect.Effect<A, E, Resources> => effect;

/** Options for {@link render} and {@link contactSheet}. */
export interface StillsOptions {
	/** Supersampling factor; output is scene size × dpr. Defaults to 1. */
	readonly dpr?: number;
}

/** Options for {@link contactSheet}. */
export interface ContactSheetOptions extends StillsOptions, TileOptions {
	/**
	 * Downscale each tile to at most this many pixels wide (box sampling,
	 * aspect kept) so the sheet stays small. Omit to tile at full size.
	 */
	readonly maxTileWidth?: number;
}

/** Options for {@link tile}. */
export interface TileOptions {
	/** Grid columns. Defaults to `ceil(sqrt(n))`. */
	readonly columns?: number;
	/** Pixels between tiles (and none around the edge). Defaults to 4. */
	readonly gap?: number;
}

/** A tiled RGBA image. Tile `i` sits at row `floor(i / columns)`, column `i % columns`. */
export interface Grid {
	readonly rgba: Uint8Array;
	readonly width: number;
	readonly height: number;
	readonly columns: number;
	readonly rows: number;
}

/** A contact sheet: the encoded PNG plus its grid layout. */
export interface ContactSheet extends Omit<Grid, "rgba"> {
	readonly png: Uint8Array;
	readonly tileWidth: number;
	readonly tileHeight: number;
}

const renderAll = (frames: ReadonlyArray<AnyFrame>, options: StillsOptions) =>
	Effect.scoped(
		Effect.gen(function* () {
			const first = frames[0];
			if (first === undefined) return [];
			const renderer = yield* NodeRenderer.make({
				width: first.width,
				height: first.height,
				pixelRatio: options.dpr ?? 1,
			});
			return yield* Effect.forEach(frames, (frame) =>
				NodeRenderer.renderToRgba(renderer, frame).pipe(
					Effect.map((rgba) => ({
						rgba,
						width: renderer.pixelWidth,
						height: renderer.pixelHeight,
					})),
				),
			);
		}),
	);

/**
 * Render each frame to PNG bytes, in order. An empty list renders nothing.
 *
 * Requires the frames' font/image loaders (`Font.layer` / `Image.layer`) —
 * the same layers the scene is previewed and exported with.
 */
export const render = <Resources = never>(
	frames: ReadonlyArray<Frame<Resources>>,
	options: StillsOptions = {},
) =>
	requires(
		frames,
		renderAll(frames, options).pipe(
			Effect.map((images) =>
				images.map(({ rgba, width, height }) =>
					NodeRenderer.encodePng(rgba, width, height),
				),
			),
		),
	);

/**
 * Render the frames and tile them row-major into one PNG. Gaps take the
 * first frame's background color. Fails as a defect on an empty list.
 * Requires the frames' font/image loaders, like {@link render}.
 *
 * ponytail: no text labels on tiles — callers print the tile → frame
 * mapping. Burn labels in (via a Text entity overlay) if a sheet must stand
 * alone.
 */
export const contactSheet = <Resources = never>(
	frames: ReadonlyArray<Frame<Resources>>,
	options: ContactSheetOptions = {},
) =>
	requires(
		frames,
		Effect.gen(function* () {
			const first = frames[0];
			if (first === undefined) {
				return yield* Effect.die(
					new Error("Stills.contactSheet: no frames to tile"),
				);
			}
			const images = (yield* renderAll(frames, options)).map((image) =>
				options.maxTileWidth === undefined
					? image
					: downscale(
							image.rgba,
							image.width,
							image.height,
							options.maxTileWidth,
						),
			);
			const { width: tileWidth, height: tileHeight } = images[0] ?? first;
			const grid = tile(
				images.map((i) => i.rgba),
				tileWidth,
				tileHeight,
				{ ...options, background: Color.bytes(first.backgroundColor) },
			);
			return {
				png: NodeRenderer.encodePng(grid.rgba, grid.width, grid.height),
				width: grid.width,
				height: grid.height,
				columns: grid.columns,
				rows: grid.rows,
				tileWidth,
				tileHeight,
			} satisfies ContactSheet;
		}),
	);

/**
 * Tile same-sized RGBA images row-major into one grid. Pure.
 *
 * @param tiles - Each exactly `tileWidth * tileHeight * 4` bytes.
 */
export const tile = (
	tiles: ReadonlyArray<Uint8Array>,
	tileWidth: number,
	tileHeight: number,
	options: TileOptions & {
		readonly background?: {
			readonly r: number;
			readonly g: number;
			readonly b: number;
			readonly a: number;
		};
	} = {},
): Grid => {
	const n = tiles.length;
	const columns = Math.max(1, options.columns ?? Math.ceil(Math.sqrt(n)));
	const rows = Math.max(1, Math.ceil(n / columns));
	const gap = options.gap ?? 4;
	const width = columns * tileWidth + (columns - 1) * gap;
	const height = rows * tileHeight + (rows - 1) * gap;
	const rgba = new Uint8Array(width * height * 4);
	const { r, g, b, a } = options.background ?? { r: 0, g: 0, b: 0, a: 0 };
	for (let i = 0; i < rgba.length; i += 4) {
		rgba[i] = r;
		rgba[i + 1] = g;
		rgba[i + 2] = b;
		rgba[i + 3] = a;
	}
	const stride = tileWidth * 4;
	tiles.forEach((src, i) => {
		const x = (i % columns) * (tileWidth + gap);
		const y = Math.floor(i / columns) * (tileHeight + gap);
		for (let row = 0; row < tileHeight; row++) {
			rgba.set(
				src.subarray(row * stride, row * stride + stride),
				((y + row) * width + x) * 4,
			);
		}
	});
	return { rgba, width, height, columns, rows };
};

/**
 * Box-downscale an RGBA image to at most `maxWidth` wide, keeping aspect.
 * Returns the input untouched when it already fits. Pure.
 */
export const downscale = (
	rgba: Uint8Array,
	width: number,
	height: number,
	maxWidth: number,
): { rgba: Uint8Array; width: number; height: number } => {
	if (width <= maxWidth) return { rgba, width, height };
	const w = Math.max(1, Math.floor(maxWidth));
	const h = Math.max(1, Math.round((height * w) / width));
	const out = new Uint8Array(w * h * 4);
	for (let dy = 0; dy < h; dy++) {
		const y0 = Math.floor((dy * height) / h);
		const y1 = Math.max(y0 + 1, Math.floor(((dy + 1) * height) / h));
		for (let dx = 0; dx < w; dx++) {
			const x0 = Math.floor((dx * width) / w);
			const x1 = Math.max(x0 + 1, Math.floor(((dx + 1) * width) / w));
			const sum = [0, 0, 0, 0];
			for (let y = y0; y < y1; y++) {
				for (let x = x0; x < x1; x++) {
					for (let c = 0; c < 4; c++) {
						sum[c] = (sum[c] ?? 0) + (rgba[(y * width + x) * 4 + c] ?? 0);
					}
				}
			}
			const count = (y1 - y0) * (x1 - x0);
			for (let c = 0; c < 4; c++) {
				out[(dy * w + dx) * 4 + c] = Math.round((sum[c] ?? 0) / count);
			}
		}
	}
	return { rgba: out, width: w, height: h };
};
