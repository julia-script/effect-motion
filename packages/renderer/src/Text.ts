import { ThreeRaw as THREE } from "@effect-motion/three";
import { type FontHandle, loadFont } from "@text-rendering-toolkit/font";
import {
	type HorizontalAnchor,
	type LayoutResult,
	layoutText,
	type VerticalAnchor,
} from "@text-rendering-toolkit/layout";
import {
	Text as GlyphText,
	TextResources,
} from "@text-rendering-toolkit/three-webgpu";
import { Effect } from "effect";
import { EffectMotionError } from "effect-motion";

/**
 * Text rendering: fonts, glyph atlas, and layout.
 *
 * @remarks
 * Text is drawn from a signed-distance-field atlas rather than as geometry,
 * which is what lets a string stay crisp at any scale without re-tessellating
 * as it grows.
 *
 * The pipeline is `@text-rendering-toolkit`: HarfBuzz shaping and glyph
 * outlines (`/font`), anchoring and line layout (`/layout`), and the
 * `WebGPURenderer` glyph mesh (`/three-webgpu`) in its `depthInk` mode —
 * fully-covered ink blends exactly once per pixel at any opacity and writes
 * the depth buffer, so text participates in the renderer's z-buffer
 * occlusion. The same code path serves browser and headless Node; the glyph
 * atlas is shared per renderer and grows on demand.
 *
 * This module is the adapter: it owns the per-renderer font handles and
 * atlas resources, maps entity anchor semantics onto layout anchors, and
 * wraps every toolkit boundary in typed effects.
 */

/**
 * The per-renderer text state: loaded fonts and the shared glyph resources.
 *
 * @remarks
 * Owned by a `Sync` and disposed with it, after every mesh borrowing the
 * resources (borrowers before owner). Mostly data — the API is the sibling
 * functions ({@link registerFont}, {@link layout}, {@link makeMesh}).
 */
export interface Text {
	/** internal: shared glyph SDF cache + atlas for every mesh of this renderer */
	readonly resources: TextResources;
	/** internal: font id → loaded caller-owned handle */
	readonly fonts: Map<string, FontHandle>;
}

export const make = (): Text => ({
	resources: new TextResources(),
	fonts: new Map(),
});

/**
 * Load a font's bytes under its id.
 *
 * @remarks
 * Idempotent per id — registering the same font twice does nothing the
 * second time. A font must be registered before any string using it can be
 * laid out; `Sync.resolveResources` handles that for frames. Effectful
 * because font parsing initializes WASM shaping state.
 */
export const registerFont = (
	text: Text,
	id: string,
	bytes: Uint8Array,
): Effect.Effect<void, EffectMotionError> =>
	text.fonts.has(id)
		? Effect.void
		: Effect.tryPromise({
				try: async () => {
					const handle = await loadFont(bytes);
					text.fonts.set(id, handle);
				},
				catch: (cause) =>
					EffectMotionError.of(`Text: font "${id}" could not be loaded`, cause),
			});

export const hasFont = (text: Text, id: string): boolean => text.fonts.has(id);

export const dispose = (text: Text): void => {
	for (const handle of text.fonts.values()) {
		handle.dispose();
	}
	text.fonts.clear();
	text.resources.dispose();
};

/** What to lay out: the string, the font, its size, and its alignment. */
export interface LayoutRequest {
	readonly text: string;
	/** Id of a font registered with {@link registerFont}. */
	readonly fontId: string;
	readonly fontSize: number;
	/**
	 * Horizontal alignment relative to the entity's position.
	 *
	 * @defaultValue `"start"`
	 */
	readonly textAnchor?: "start" | "middle" | "end" | undefined;
	/**
	 * Vertical alignment relative to the entity's position.
	 *
	 * @defaultValue `"auto"` — the text's own baseline
	 */
	readonly baseline?: "auto" | "middle" | "hanging" | undefined;
}

// entity anchor semantics → layout anchors; the defaults preserve
// baseline-left at local (0, 0)
const anchorXOf = (anchor: LayoutRequest["textAnchor"]): HorizontalAnchor =>
	anchor === "middle" ? "center" : anchor === "end" ? "right" : "left";

const anchorYOf = (baseline: LayoutRequest["baseline"]): VerticalAnchor =>
	baseline === "middle"
		? "middle"
		: baseline === "hanging"
			? "top"
			: "top-baseline";

/**
 * Lay out a string into a renderer-neutral {@link LayoutResult}.
 *
 * @remarks
 * Shapes and positions the glyphs with the anchor and baseline offsets
 * applied. By default the text's baseline-left sits at local (0, 0).
 * Coordinates are y-up layout units, axis-identical to scene space.
 *
 * Layout failures arrive as typed errors naming the font. The font must be
 * registered first — an unregistered font is a defect.
 */
export const layout = Effect.fnUntraced(function* (
	text: Text,
	request: LayoutRequest,
): Effect.fn.Return<LayoutResult, EffectMotionError> {
	if (!text.fonts.has(request.fontId)) {
		return yield* Effect.die(
			new Error(
				`Text: font "${request.fontId}" was not registered before layout`,
			),
		);
	}
	return yield* Effect.try({
		try: () =>
			layoutText(
				{
					text: request.text,
					style: {
						key: "fill",
						fontKeys: [request.fontId],
						fontSize: request.fontSize,
						language: "und",
					},
					layout: {
						anchorX: anchorXOf(request.textAnchor),
						anchorY: anchorYOf(request.baseline),
					},
				},
				text.fonts,
			),
		catch: (cause) =>
			EffectMotionError.of(
				`Text: layout failed for font "${request.fontId}"`,
				cause,
			),
	});
});

/** A glyph mesh over the shared resources, with its update and release hooks. */
export interface TextMesh {
	readonly mesh: THREE.Object3D;
	/** Point the mesh at a new layout — pair with {@link TextMesh.commit}. */
	readonly setLayout: (layout: LayoutResult) => void;
	/** Set the fill color; `r`, `g`, `b` are 0–255, `a` is 0–1 opacity. */
	readonly setColor: (r: number, g: number, b: number, a: number) => void;
	/** Flush pending layout/appearance changes into the GPU state. */
	readonly commit: () => Effect.Effect<void, EffectMotionError>;
	/** Release the mesh's geometry and materials (shared resources stay). */
	readonly dispose: () => void;
}

/**
 * Build a mesh that draws glyphs from the shared resources.
 *
 * @remarks
 * The toolkit mesh is created lazily on the first {@link TextMesh.setLayout}
 * — its constructor requires a layout, and a text entity has none until its
 * first layout resolves. Appearance setters are inert until
 * {@link TextMesh.commit} runs; the entity renderer registers commits with
 * `ctx.waitFor`, so a frame is never drawn with half-built text.
 *
 * The mesh carries a tiny z-lift so text sits above coplanar backdrops
 * (invisible at ordinary scales, deterministic).
 */
export const makeMesh = (text: Text): TextMesh => {
	const group = new THREE.Group();
	const color = new THREE.Color(1, 1, 1);
	let opacity = 1;
	let glyphs: GlyphText | null = null;

	const applyAppearance = (mesh: GlyphText): void => {
		mesh.color = color;
		mesh.opacity = opacity;
	};

	return {
		mesh: group,
		setLayout: (layoutResult) => {
			if (glyphs === null) {
				glyphs = new GlyphText({
					layout: layoutResult,
					fonts: text.fonts,
					resources: text.resources,
					depthInk: true,
				});
				// z-lift: keep text above coplanar backdrops so the depth-ink
				// core never loses to a shape at the same depth
				glyphs.position.z = 0.05;
				group.add(glyphs);
			} else {
				glyphs.layout = layoutResult;
			}
			applyAppearance(glyphs);
		},
		setColor: (r, g, b, a) => {
			color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
			opacity = a;
			group.visible = a > 0;
			if (glyphs !== null) {
				applyAppearance(glyphs);
			}
		},
		commit: () =>
			Effect.suspend(() => {
				const target = glyphs;
				return target === null
					? Effect.void
					: Effect.tryPromise({
							try: () => target.sync(),
							catch: (cause) =>
								EffectMotionError.of("Text: glyph commit failed", cause),
						});
			}),
		dispose: () => {
			glyphs?.dispose();
		},
	};
};
