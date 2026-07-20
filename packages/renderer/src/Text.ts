import { ThreeRaw as THREE, Tsl } from "@effect-motion/three";
import { Effect } from "effect";
import { EffectMotionError } from "effect-motion";
import { typesetterWorkerModule } from "troika-three-text";
import createSdfGenerator from "webgl-sdf-generator";

/**
 * The SDF text actor: registered font bytes, the atlas texture, the glyph
 * cache, and layout. troika's typesetter (font parsing + layout + glyph
 * paths, run on the main thread — no workers, no DOM) feeds
 * webgl-sdf-generator's pure-JS SDF into a package-owned DataTexture
 * atlas, rendered by a TSL node material. One uniform code path for
 * browser and Node — troika's stock pipeline (GLSL-derived material,
 * WebGL/canvas atlas) is unusable under WebGPU/headless, so only its
 * typesetting layer is consumed. This module is the boundary: troika and
 * the SDF generator never cross into the rest of the package raw.
 *
 * ponytail: pure-JS SDF generation only (no WebGL acceleration) and one
 * glyph per atlas cell (no 4-per-RGBA packing) — both trade some speed and
 * memory for a uniform, canvas-free pipeline; revisit if atlas build time
 * or size ever shows up.
 */

const SDF_GLYPH_SIZE = 64;
const SDF_EXPONENT = 9;
const SDF_MARGIN = 1 / 16;
const ATLAS_WIDTH = 1024;
const ATLAS_HEIGHT = 1024;
const GLYPHS_PER_ROW = ATLAS_WIDTH / SDF_GLYPH_SIZE;
/** ponytail: fixed-capacity atlas (256 glyphs); grow-and-reallocate when a
 * scene ever exceeds it. Overflow is a typed error naming the remedy. */
const ATLAS_CAPACITY = GLYPHS_PER_ROW * (ATLAS_HEIGHT / SDF_GLYPH_SIZE);

const toBase64 = (bytes: Uint8Array): string => {
	if (typeof Buffer !== "undefined") {
		return Buffer.from(bytes).toString("base64");
	}
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
};

interface GlyphSlot {
	/** atlas UV rect [u0, v0, u1, v1] */
	readonly uv: [number, number, number, number];
	/** SDF viewbox in font units [minX, minY, maxX, maxY] */
	readonly viewBox: [number, number, number, number];
}

export interface GlyphQuads {
	/** per-glyph quad bounds [minX, minY, maxX, maxY], mesh-local (y-up) */
	readonly bounds: Float32Array;
	/** per-glyph atlas uv rects [u0, v0, u1, v1] */
	readonly uvRects: Float32Array;
	readonly count: number;
	/** text block [minX, minY, maxX, maxY] before anchor offset, y-up */
	readonly blockBounds: [number, number, number, number];
}

export interface LayoutRequest {
	readonly text: string;
	readonly fontId: string;
	readonly fontSize: number;
	readonly textAnchor?: "start" | "middle" | "end" | undefined;
	readonly baseline?: "auto" | "middle" | "hanging" | undefined;
}

/**
 * Per-renderer text state: registered font data URIs, the shared SDF
 * atlas (single channel, one glyph per cell), and the glyph cache. Owned
 * by a `Sync`; the atlas texture is disposed with it. Mostly data — the
 * API is the sibling functions.
 */
export interface Text {
	readonly atlas: THREE.DataTexture;
	/** internal: raw atlas bytes the texture samples */
	readonly atlasData: Uint8Array;
	/** internal: font id → data URI */
	readonly fonts: Map<string, string>;
	/** internal: `${fontSrc}#${glyphId}` → atlas slot */
	readonly glyphs: Map<string, GlyphSlot>;
	/** internal: next free atlas cell */
	glyphCount: number;
	/** internal: the pure-JS SDF generator instance */
	readonly sdf: ReturnType<typeof createSdfGenerator>;
	/** internal: memoized typesetter init */
	typesetter: Promise<import("troika-three-text").Typesetter> | undefined;
}

export const make = (): Text => {
	const atlasData = new Uint8Array(ATLAS_WIDTH * ATLAS_HEIGHT);
	const atlas = new THREE.DataTexture(
		atlasData,
		ATLAS_WIDTH,
		ATLAS_HEIGHT,
		THREE.RedFormat,
		THREE.UnsignedByteType,
	);
	atlas.minFilter = THREE.LinearFilter;
	atlas.magFilter = THREE.LinearFilter;
	atlas.generateMipmaps = false;
	return {
		atlas,
		atlasData,
		fonts: new Map(),
		glyphs: new Map(),
		glyphCount: 0,
		sdf: createSdfGenerator(),
		typesetter: undefined,
	};
};

/** Provide a font's bytes under its id (idempotent per id). */
export const registerFont = (
	text: Text,
	id: string,
	bytes: Uint8Array,
): void => {
	if (!text.fonts.has(id)) {
		text.fonts.set(id, `data:font/ttf;base64,${toBase64(bytes)}`);
	}
};

export const hasFont = (text: Text, id: string): boolean => text.fonts.has(id);

export const dispose = (text: Text): void => {
	text.atlas.dispose();
};

/** the atlas slot for a glyph, generating its SDF on first sight —
 * sync inner kernel; failures surface through `layout`'s error channel */
const glyphSlot = (
	text: Text,
	fontSrc: string,
	glyphId: number,
	result: import("troika-three-text").TypesetResult,
): GlyphSlot => {
	const key = `${fontSrc}#${glyphId}`;
	const cached = text.glyphs.get(key);
	if (cached !== undefined) {
		return cached;
	}
	const glyph = result.glyphData[fontSrc]?.[glyphId];
	if (glyph === undefined) {
		throw new Error(`no glyph data for glyph ${glyphId}`);
	}
	if (text.glyphCount >= ATLAS_CAPACITY) {
		throw new Error(
			`glyph atlas is full (${ATLAS_CAPACITY} glyphs) — raise the atlas size in @effect-motion/renderer's Text module`,
		);
	}
	const [minX, minY, maxX, maxY] = glyph.pathBounds;
	// margin around path edges, mirroring troika's atlas math
	const fontUnitsMargin =
		(Math.max(maxX - minX, maxY - minY) / SDF_GLYPH_SIZE) *
		(SDF_MARGIN * SDF_GLYPH_SIZE + 0.5);
	const viewBox: [number, number, number, number] = [
		minX - fontUnitsMargin,
		minY - fontUnitsMargin,
		maxX + fontUnitsMargin,
		maxY + fontUnitsMargin,
	];
	const maxDist = Math.max(viewBox[2] - viewBox[0], viewBox[3] - viewBox[1]);
	const sdfData = text.sdf.javascript.generate(
		SDF_GLYPH_SIZE,
		SDF_GLYPH_SIZE,
		glyph.path,
		viewBox,
		maxDist,
		SDF_EXPONENT,
	);
	const index = text.glyphCount++;
	const col = index % GLYPHS_PER_ROW;
	const row = Math.floor(index / GLYPHS_PER_ROW);
	const x0 = col * SDF_GLYPH_SIZE;
	const y0 = row * SDF_GLYPH_SIZE;
	for (let y = 0; y < SDF_GLYPH_SIZE; y++) {
		text.atlasData.set(
			sdfData.subarray(y * SDF_GLYPH_SIZE, (y + 1) * SDF_GLYPH_SIZE),
			(y0 + y) * ATLAS_WIDTH + x0,
		);
	}
	text.atlas.needsUpdate = true;
	const slot: GlyphSlot = {
		uv: [
			x0 / ATLAS_WIDTH,
			y0 / ATLAS_HEIGHT,
			(x0 + SDF_GLYPH_SIZE) / ATLAS_WIDTH,
			(y0 + SDF_GLYPH_SIZE) / ATLAS_HEIGHT,
		],
		viewBox,
	};
	text.glyphs.set(key, slot);
	return slot;
};

/**
 * Layout a string: typeset, generate any unseen glyph SDFs into the
 * atlas, and return quad bounds + uv rects with the anchor/baseline
 * offset applied (baseline-left at local (0,0) by default). Typesetting
 * and SDF failures land in the error channel naming the font; an
 * unregistered font is a defect — `Sync.resolveResources` guarantees
 * registration before any layout runs.
 */
export const layout = Effect.fnUntraced(function* (
	text: Text,
	request: LayoutRequest,
): Effect.fn.Return<GlyphQuads, EffectMotionError> {
	const src = text.fonts.get(request.fontId);
	if (src === undefined) {
		return yield* Effect.die(
			new Error(
				`Text: font "${request.fontId}" was not registered before layout`,
			),
		);
	}
	const result = yield* Effect.tryPromise({
		try: async () => {
			text.typesetter ??= typesetterWorkerModule.onMainThread._getInitResult();
			const typesetter = await text.typesetter;
			return new Promise<import("troika-three-text").TypesetResult>(
				(resolve) => {
					typesetter.typeset(
						{
							text: request.text,
							font: [{ label: "user", src }],
							fontSize: request.fontSize,
							sdfGlyphSize: SDF_GLYPH_SIZE,
						},
						resolve,
					);
				},
			);
		},
		catch: (cause) =>
			EffectMotionError.of(
				`Text: typesetting failed for font "${request.fontId}"`,
				cause,
			),
	});

	return yield* Effect.try({
		try: () => {
			const count = result.glyphIds.length;
			const bounds = new Float32Array(count * 4);
			const uvRects = new Float32Array(count * 4);
			const { blockBounds, topBaseline } = result;
			// anchor offsets: baseline-left at (0,0) by default (scene semantics)
			const width = blockBounds[2] - blockBounds[0];
			const anchor = request.textAnchor;
			const dx =
				(anchor === "middle" ? -width / 2 : anchor === "end" ? -width : 0) -
				blockBounds[0];
			const dy =
				request.baseline === "middle"
					? -(blockBounds[1] + blockBounds[3]) / 2
					: request.baseline === "hanging"
						? -blockBounds[3]
						: -topBaseline;
			for (let i = 0; i < count; i++) {
				const glyphId = result.glyphIds[i] ?? 0;
				const fontIndex = result.glyphFontIndices[i] ?? 0;
				const font = result.fontData[fontIndex];
				if (font === undefined) {
					continue;
				}
				const slot = glyphSlot(text, font.src, glyphId, result);
				const posX = result.glyphPositions[i * 2] ?? 0;
				const posY = result.glyphPositions[i * 2 + 1] ?? 0;
				const fontSizeMult = result.fontSize / font.unitsPerEm;
				bounds[i * 4] = dx + posX + slot.viewBox[0] * fontSizeMult;
				bounds[i * 4 + 1] = dy + posY + slot.viewBox[1] * fontSizeMult;
				bounds[i * 4 + 2] = dx + posX + slot.viewBox[2] * fontSizeMult;
				bounds[i * 4 + 3] = dy + posY + slot.viewBox[3] * fontSizeMult;
				uvRects[i * 4] = slot.uv[0];
				uvRects[i * 4 + 1] = slot.uv[1];
				uvRects[i * 4 + 2] = slot.uv[2];
				uvRects[i * 4 + 3] = slot.uv[3];
			}
			return { bounds, uvRects, count, blockBounds } satisfies GlyphQuads;
		},
		catch: (cause) =>
			EffectMotionError.of(
				`Text: glyph SDF generation failed for font "${request.fontId}"`,
				cause,
			),
	});
});

// ── glyph mesh: instanced quads + TSL SDF material ───────────────────────

/** unit quad (0..1)², two triangles — instanced per glyph */
const makeQuadGeometry = (): THREE.InstancedBufferGeometry => {
	const geometry = new THREE.InstancedBufferGeometry();
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], 3),
	);
	geometry.setIndex([0, 1, 2, 2, 1, 3]);
	geometry.instanceCount = 0;
	return geometry;
};

export interface TextMesh {
	readonly mesh: THREE.Object3D;
	readonly setQuads: (quads: GlyphQuads) => void;
	readonly setColor: (r: number, g: number, b: number, a: number) => void;
	readonly dispose: () => void;
}

/**
 * A glyph mesh over the actor's atlas, in two passes so overlapping glyph
 * ink (connected scripts, tight kerning) blends exactly ONCE per pixel at
 * any string opacity:
 *
 * - core pass: fragments with SDF coverage ≥ 0.5 draw flat at the string
 *   opacity, write depth with `LessDepth` — a second glyph's core at the
 *   same depth fails the test, deduplicating the join.
 * - edge pass: the antialiasing ring (coverage < 0.5) blends without depth
 *   writes; core-covered pixels reject it via the depth buffer.
 *
 * The mesh carries a tiny z-lift so text sits above coplanar backdrops
 * (invisible at ordinary scales, deterministic).
 */
export const makeMesh = (text: Text): TextMesh => {
	const geometry = makeQuadGeometry();

	// ponytail: TSL typing quarantined — see the note in the atlas material.
	interface TslNode {
		readonly x: TslNode;
		readonly y: TslNode;
		readonly xy: TslNode;
		readonly zw: TslNode;
		readonly r: TslNode;
		mul(value: unknown): TslNode;
		sub(value: unknown): TslNode;
		add(value: unknown): TslNode;
		lessThan(value: unknown): TslNode;
		greaterThanEqual(value: unknown): TslNode;
		select(onTrue: unknown, onFalse: unknown): TslNode;
	}
	type TslFn = (...args: ReadonlyArray<unknown>) => TslNode;
	const t = Tsl as unknown as Record<
		| "attribute"
		| "vec2"
		| "vec3"
		| "mix"
		| "texture"
		| "fwidth"
		| "smoothstep"
		| "float",
		TslFn
	> & { positionGeometry: TslNode };

	const buildNodes = () => {
		const glyphBounds = t.attribute("glyphBounds", "vec4");
		const glyphUvRect = t.attribute("glyphUvRect", "vec4");
		const corner = t.vec2(t.positionGeometry.x, t.positionGeometry.y);
		const position = t.vec3(t.mix(glyphBounds.xy, glyphBounds.zw, corner), 0);
		const uv = t.mix(glyphUvRect.xy, glyphUvRect.zw, corner);
		const distance = t.texture(text.atlas, uv).r;
		const halfWidth = t.fwidth(distance).mul(0.5);
		const coverage = t.smoothstep(
			t.float(0.5).sub(halfWidth),
			t.float(0.5).add(halfWidth),
			distance,
		);
		return { position, coverage };
	};

	const uOpacity = Tsl.uniform(1);

	const coreMaterial = new THREE.MeshBasicNodeMaterial();
	coreMaterial.transparent = true;
	coreMaterial.side = THREE.DoubleSide;
	coreMaterial.depthWrite = true;
	coreMaterial.depthFunc = THREE.LessDepth;
	{
		const { position, coverage } = buildNodes();
		coreMaterial.positionNode = position as never;
		// margins/edges get alpha 0 and are DISCARDED by the alpha test, so
		// they never write depth — only actual ink deduplicates
		coreMaterial.opacityNode = coverage
			.greaterThanEqual(0.5)
			.select(uOpacity as unknown as TslNode, t.float(0)) as never;
		coreMaterial.alphaTestNode = t.float(1 / 255) as never;
	}

	const edgeMaterial = new THREE.MeshBasicNodeMaterial();
	edgeMaterial.transparent = true;
	edgeMaterial.side = THREE.DoubleSide;
	edgeMaterial.depthWrite = false;
	{
		const { position, coverage } = buildNodes();
		edgeMaterial.positionNode = position as never;
		edgeMaterial.opacityNode = coverage
			.lessThan(0.5)
			.select(coverage.mul(uOpacity), t.float(0)) as never;
	}

	const coreMesh = new THREE.Mesh(geometry, coreMaterial);
	const edgeMesh = new THREE.Mesh(geometry, edgeMaterial);
	coreMesh.frustumCulled = false;
	edgeMesh.frustumCulled = false;
	const group = new THREE.Group();
	// z-lift: keep text above coplanar backdrops so the core depth test
	// never loses to a shape at the same depth
	coreMesh.position.z = 0.05;
	edgeMesh.position.z = 0.05;
	group.add(coreMesh);
	group.add(edgeMesh);

	const setVisible = (visible: boolean) => {
		coreMesh.visible = visible;
		edgeMesh.visible = visible;
	};

	return {
		mesh: group,
		setQuads: (quads) => {
			geometry.setAttribute(
				"glyphBounds",
				new THREE.InstancedBufferAttribute(quads.bounds, 4),
			);
			geometry.setAttribute(
				"glyphUvRect",
				new THREE.InstancedBufferAttribute(quads.uvRects, 4),
			);
			geometry.instanceCount = quads.count;
		},
		setColor: (r, g, b, a) => {
			for (const material of [coreMaterial, edgeMaterial]) {
				material.color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
			}
			uOpacity.value = a;
			setVisible(a > 0);
		},
		dispose: () => {
			geometry.dispose();
			coreMaterial.dispose();
			edgeMaterial.dispose();
		},
	};
};
