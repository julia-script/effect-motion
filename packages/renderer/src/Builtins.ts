import { Line2 as FatLine, ThreeRaw as THREE, Tsl } from "@effect-motion/three";
import { Effect } from "effect";
import { Color, type Entity, Runner } from "effect-motion";
import type { PathCommand } from "effect-motion/Entity";
import { renderOpacity, renderSize } from "effect-motion/particles/overLife";
import type { OverLife, Particle } from "effect-motion/particles/Particle";
import type { ParticleField } from "effect-motion/particles/ParticleField";
import type {
	EntityRenderer,
	EntityRenderers,
	Leaf,
	RenderContext,
	Retained,
} from "./EntityRenderer.js";
import * as Images from "./Images.js";
import * as Stroke from "./Stroke.js";
import * as Text from "./Text.js";

/**
 * Built-in entity renderers: the retained (`build`/`update`/`dispose`) port
 * of the ThorVG paint manifest. Flat unlit look — MeshBasicNodeMaterial for
 * fills, retained occupancy masks for planar strokes, and world-unit fat
 * lines for nonplanar strokes. Width remains an authored world dimension;
 * planar coverage is painted once after all segments and subpaths resolve.
 */

const CIRCLE_SEGMENTS = 64;

// shared unit geometries — shapes scale them, so there are no per-frame
// geometry rebuilds for circles/ellipses/rects at all. Both are CENTERED on
// their anchor: `position` is the shape's center, like Manim/Motion Canvas.
const unitCircle = new THREE.CircleGeometry(1, CIRCLE_SEGMENTS);
const unitPlane = new THREE.PlaneGeometry(1, 1);

const setColor = (
	material: THREE.MeshBasicNodeMaterial | THREE.Line2NodeMaterial,
	color: Color.Color,
	shapeOpacity: number,
): void => {
	const { r, g, b, a } = Color.bytes(color);
	material.color.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
	material.opacity = (a / 255) * shapeOpacity;
	material.transparent = true;
};

// ── billboard fills (circle / ellipse / square / rect) ───────────────────
// Each fill is a Group: the fill mesh plus an optional stroke outline
// (world-unit fat line). Outline geometry is built at actual size in local
// space so stroke width stays uniform; position/billboard live on the group.

interface FillParts {
	readonly group: THREE.Group;
	readonly mesh: THREE.Mesh;
	outline: Stroke.Stroke | null;
}

const buildFillGroup = (): { retained: Retained; parts: FillParts } => {
	const material = new THREE.MeshBasicNodeMaterial();
	material.side = THREE.DoubleSide;
	const mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicNodeMaterial> =
		new THREE.Mesh(unitPlane as THREE.BufferGeometry, material);
	const group = new THREE.Group();
	group.add(mesh);
	const parts: FillParts = { group, mesh, outline: null };
	const retained: Retained = {
		object: group,
		billboard: true,
		dispose: () => {
			material.dispose();
			if (mesh.geometry !== unitPlane && mesh.geometry !== unitCircle) {
				mesh.geometry.dispose();
			}
			if (parts.outline !== null) {
				Stroke.dispose(parts.outline);
			}
		},
	};
	group.userData.parts = parts;
	return { retained, parts };
};

const partsOf = (retained: Retained): FillParts =>
	(retained.object as THREE.Group).userData.parts as FillParts;

/** swap the fill mesh geometry, disposing a previous per-instance one */
const setFillGeometry = (
	parts: FillParts,
	geometry: THREE.BufferGeometry,
): void => {
	const previous = parts.mesh.geometry;
	if (previous !== geometry) {
		if (previous !== unitPlane && previous !== unitCircle) {
			previous.dispose();
		}
		parts.mesh.geometry = geometry;
	}
};

/** stroke outline from a closed local-space polyline, or none */
const setOutline = (
	parts: FillParts,
	data: { strokeColor?: Color.Color; strokeWidth?: number; opacity: number },
	points: ReadonlyArray<readonly [number, number]> | null,
): void => {
	if (data.strokeColor === undefined || points === null) {
		if (parts.outline !== null) {
			parts.group.remove(parts.outline.object);
			Stroke.dispose(parts.outline);
			parts.outline = null;
		}
		return;
	}
	if (parts.outline === null) {
		parts.outline = Stroke.make();
		parts.group.add(parts.outline.object);
	}
	Stroke.update(
		parts.outline,
		[{ points: points.map(([x, y]) => ({ x, y, z: 0 })), closed: true }],
		data.strokeWidth ?? 1,
		data.strokeColor,
		data.opacity,
	);
};

const ellipsePoints = (
	rx: number,
	ry: number,
): Array<readonly [number, number]> => {
	const points: Array<readonly [number, number]> = [];
	for (let i = 0; i < CIRCLE_SEGMENTS; i++) {
		const a = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
		points.push([Math.cos(a) * rx, Math.sin(a) * ry]);
	}
	return points;
};

// rect outline points, center-anchored local frame (±w/2, ±h/2). Sharp
// corners only — rounded rects were removed with the entity-model rewrite.
const rectPoints = (
	width: number,
	height: number,
): Array<readonly [number, number]> => [
	[-width / 2, height / 2],
	[width / 2, height / 2],
	[width / 2, -height / 2],
	[-width / 2, -height / 2],
];

const placeFillGroup = (
	retained: Retained,
	leaf: Leaf,
	ctx: RenderContext,
	fill: Color.Color,
	opacity: number,
): FillParts => {
	const parts = partsOf(retained);
	const material = parts.mesh.material as THREE.MeshBasicNodeMaterial;
	setColor(material, fill, opacity);
	parts.mesh.visible = material.opacity > 0;
	parts.group.position.copy(
		ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z),
	);
	return parts;
};

const circle: EntityRenderer<Entity.EntityByTag<"Circle">> = {
	build: (leaf, ctx) => {
		const { retained, parts } = buildFillGroup();
		parts.mesh.geometry = unitCircle;
		circle.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const parts = placeFillGroup(
			retained,
			leaf,
			ctx,
			leaf.data.fillColor,
			leaf.data.opacity,
		);
		parts.mesh.scale.set(leaf.data.radius, leaf.data.radius, 1);
		setOutline(
			parts,
			leaf.data,
			leaf.data.strokeColor !== undefined
				? ellipsePoints(leaf.data.radius, leaf.data.radius)
				: null,
		);
	},
};

const ellipse: EntityRenderer<Entity.EntityByTag<"Ellipse">> = {
	build: (leaf, ctx) => {
		const { retained, parts } = buildFillGroup();
		parts.mesh.geometry = unitCircle;
		ellipse.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const parts = placeFillGroup(
			retained,
			leaf,
			ctx,
			leaf.data.fillColor,
			leaf.data.opacity,
		);
		parts.mesh.scale.set(leaf.data.radiusX, leaf.data.radiusY, 1);
		setOutline(
			parts,
			leaf.data,
			leaf.data.strokeColor !== undefined
				? ellipsePoints(leaf.data.radiusX, leaf.data.radiusY)
				: null,
		);
	},
};

const rect: EntityRenderer<Entity.EntityByTag<"Rect">> = {
	build: (leaf, ctx) => {
		const { retained } = buildFillGroup();
		rect.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const parts = placeFillGroup(
			retained,
			leaf,
			ctx,
			leaf.data.fillColor,
			leaf.data.opacity,
		);
		const data = leaf.data;
		// corner radii are gone with the entity-model rewrite (design D13):
		// rects render sharp
		setFillGeometry(parts, unitPlane);
		parts.mesh.scale.set(data.width, data.height, 1);
		setOutline(
			parts,
			data,
			data.strokeColor !== undefined
				? rectPoints(data.width, data.height)
				: null,
		);
		const { x: rotX, y: rotY, z: rotZ } = data.rotation;
		const tilted = rotX !== 0 || rotY !== 0 || rotZ !== 0;
		retained.billboard = !tilted;
		if (tilted) {
			// scene Eulers apply X→Y→Z extrinsically (matrix Rz·Ry·Rx), which
			// is three's Euler order "ZYX" verbatim — no conjugation; rotation
			// is about the shape's center (the centered unitPlane's origin)
			parts.group.rotation.order = "ZYX";
			parts.group.rotation.set(rotX, rotY, rotZ);
		} else {
			parts.group.rotation.set(0, 0, 0);
		}
	},
};

// ── strokes (line / path) ────────────────────────────────────────────────

const makeFatLine = (): FatLine.Line2 => {
	const line = new FatLine.Line2(new FatLine.LineGeometry());
	// swap in the wrapper's alpha-blending material (upstream's transparent
	// path is a broken shared framebuffer copy — see BlendedLine2NodeMaterial)
	line.material.dispose();
	const material = new FatLine.BlendedLine2NodeMaterial();
	material.worldUnits = true;
	line.material = material;
	return line;
};

const disposeFatLine = (line: FatLine.Line2): void => {
	line.geometry.dispose();
	(line.material as THREE.Material).dispose();
};

interface LineParts {
	readonly group: THREE.Group;
	readonly stroke: Stroke.Stroke;
	readonly spatial: FatLine.Line2;
}
const lineParts = new WeakMap<Retained, LineParts>();
const line: EntityRenderer<Entity.EntityByTag<"Line">> = {
	build: (leaf, ctx) => {
		const group = new THREE.Group();
		const stroke = Stroke.make();
		const spatial = makeFatLine();
		group.add(stroke.object, spatial);
		const retained: Retained = {
			object: group,
			billboard: false,
			dispose: () => {
				Stroke.dispose(stroke);
				disposeFatLine(spatial);
			},
		};
		lineParts.set(retained, { group, stroke, spatial });
		line.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const parts = lineParts.get(retained);
		if (parts === undefined) return;
		const { start, end, strokeColor, strokeWidth, opacity } = leaf.data;
		parts.group.position.copy(
			ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z),
		);
		const planar = start.z === end.z;
		parts.spatial.visible = !planar && opacity > 0 && strokeWidth > 0;
		parts.stroke.object.visible = planar;
		if (planar) {
			Stroke.update(
				parts.stroke,
				[{ points: [start, end], closed: false }],
				strokeWidth,
				strokeColor,
				opacity,
			);
		} else {
			const material = parts.spatial.material as THREE.Line2NodeMaterial;
			setColor(material, strokeColor, opacity);
			material.linewidth = strokeWidth;
			parts.spatial.geometry.setPositions([
				start.x,
				start.y,
				start.z,
				end.x,
				end.y,
				end.z,
			]);
			parts.spatial.computeLineDistances();
		}
	},
};

interface Subpath {
	readonly points: ReadonlyArray<{ x: number; y: number; z: number }>;
	readonly closed: boolean;
}

const pathSubpaths = (
	commands: ReadonlyArray<PathCommand>,
	anchor: { x: number; y: number; z: number },
): Array<Subpath> => {
	const subpaths: Array<Subpath> = [];
	let current: Array<{ x: number; y: number; z: number }> = [];
	let lastMove = { ...anchor };
	const world = (p: { x: number; y: number; z?: number }) => ({
		x: anchor.x + p.x,
		y: anchor.y + p.y,
		z: anchor.z + (p.z ?? 0),
	});
	const flush = (closed: boolean) => {
		if (current.length >= 2) {
			subpaths.push({ points: current, closed });
		}
		current = [];
	};
	for (const command of commands) {
		switch (command._tag) {
			case "M": {
				flush(false);
				lastMove = world(command);
				current = [lastMove];
				break;
			}
			case "L": {
				if (current.length === 0) {
					current.push(lastMove);
				}
				current.push(world(command));
				break;
			}
			case "Z": {
				flush(true);
				break;
			}
		}
	}
	flush(false);
	return subpaths;
};

interface PathParts {
	readonly group: THREE.Group;
	readonly fills: THREE.Group;
	readonly spatial: THREE.Group;
	readonly stroke: Stroke.Stroke;
	commands: ReadonlyArray<PathCommand> | undefined;
	paths: ReadonlyArray<Subpath>;
}
const pathParts = new WeakMap<Retained, PathParts>();
const clearPath = (group: THREE.Group): void => {
	for (const child of [...group.children]) {
		group.remove(child);
		disposePathChild(child);
	}
};
const path: EntityRenderer<Entity.EntityByTag<"Path">> = {
	build: (leaf, ctx) => {
		const group = new THREE.Group(),
			fills = new THREE.Group(),
			spatial = new THREE.Group();
		const stroke = Stroke.make();
		group.add(fills, stroke.object, spatial);
		const retained: Retained = {
			object: group,
			billboard: false,
			dispose: () => {
				clearPath(fills);
				clearPath(spatial);
				Stroke.dispose(stroke);
			},
		};
		pathParts.set(retained, {
			group,
			fills,
			spatial,
			stroke,
			commands: undefined,
			paths: [],
		});
		path.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const parts = pathParts.get(retained);
		if (parts === undefined) return;
		const { commands, fillColor, strokeColor, strokeWidth, opacity } =
			leaf.data;
		parts.group.position.copy(
			ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z),
		);
		if (parts.commands !== commands) {
			parts.commands = commands;
			parts.paths = pathSubpaths(commands, { x: 0, y: 0, z: 0 });
			clearPath(parts.fills);
			clearPath(parts.spatial);
			for (const subpath of parts.paths) {
				if (subpath.closed && subpath.points.length >= 3) {
					const geometry = new THREE.BufferGeometry();
					geometry.setAttribute(
						"position",
						new THREE.Float32BufferAttribute(
							subpath.points.flatMap((p) => [p.x, p.y, p.z]),
							3,
						),
					);
					geometry.setIndex(
						THREE.ShapeUtils.triangulateShape(
							subpath.points.map((p) => new THREE.Vector2(p.x, p.y)),
							[],
						).flat(),
					);
					parts.fills.add(
						new THREE.Mesh(
							geometry,
							new THREE.MeshBasicNodeMaterial({ side: THREE.DoubleSide }),
						),
					);
				}
				if (!Stroke.planar(parts.paths)) {
					const fatLine = makeFatLine();
					const points = [...subpath.points];
					const first = points[0];
					if (subpath.closed && first !== undefined) points.push(first);
					fatLine.geometry.setPositions(points.flatMap((p) => [p.x, p.y, p.z]));
					fatLine.computeLineDistances();
					parts.spatial.add(fatLine);
				}
			}
		}
		for (const child of parts.fills.children) {
			if (
				child instanceof THREE.Mesh &&
				child.material instanceof THREE.MeshBasicNodeMaterial
			) {
				setColor(child.material, fillColor, opacity);
				child.visible = child.material.opacity > 0;
			}
		}
		const planar = Stroke.planar(parts.paths);
		parts.stroke.object.visible = planar;
		parts.spatial.visible = !planar;
		if (planar)
			Stroke.update(
				parts.stroke,
				parts.paths,
				strokeWidth,
				strokeColor,
				opacity,
			);
		else
			for (const child of parts.spatial.children) {
				if (child instanceof FatLine.Line2) {
					const material = child.material as THREE.Line2NodeMaterial;
					setColor(material, strokeColor, opacity);
					material.linewidth = strokeWidth;
					child.visible = material.opacity > 0 && strokeWidth > 0;
				}
			}
	},
};

const disposePathChild = (child: THREE.Object3D): void => {
	if (child instanceof FatLine.Line2) {
		disposeFatLine(child);
		return;
	}
	const mesh = child as THREE.Mesh;
	mesh.geometry.dispose();
	(mesh.material as THREE.Material).dispose();
};

// ── text: SDF glyphs (see Text.ts) ───────────────────────────────────────
// Layout and glyph commits are async (shaping + first-sight glyph SDF
// generation) and registered with ctx.waitFor, so the render path never
// presents a half-built string. The mesh billboards and scales with
// perspective like the other billboard shapes.

const text: EntityRenderer<Entity.EntityByTag<"Text">> = {
	build: (leaf, ctx) => {
		const textMesh = Text.makeMesh(ctx.text);
		const retained: Retained = {
			object: textMesh.mesh,
			billboard: true,
			dispose: () => textMesh.dispose(),
		};
		retained.object.userData.textMesh = textMesh;
		text.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const textMesh = retained.object.userData.textMesh as Text.TextMesh;
		const data = leaf.data;
		const key = [
			data.text,
			data.fontSize,
			data.fontFamily.id,
			data.textAnchor,
			data.baseline,
		].join("|");
		const keyChanged = retained.object.userData.textKey !== key;
		if (keyChanged) {
			retained.object.userData.textKey = key;
			ctx.waitFor(
				Text.layout(ctx.text, {
					text: data.text,
					fontId: data.fontFamily.id,
					fontSize: data.fontSize,
					textAnchor: data.textAnchor,
					baseline: data.baseline,
				}).pipe(
					Effect.flatMap((result) => {
						textMesh.setLayout(result);
						return textMesh.commit();
					}),
				),
			);
		}
		const { r, g, b, a } = Color.bytes(data.fillColor);
		const alpha = (a / 255) * data.opacity;
		const colorKey = `${r}|${g}|${b}|${alpha}`;
		if (retained.object.userData.textColorKey !== colorKey) {
			retained.object.userData.textColorKey = colorKey;
			textMesh.setColor(r, g, b, alpha);
			// a layout commit is already queued on key change; only a pure
			// color/opacity change needs its own
			if (!keyChanged) {
				ctx.waitFor(textMesh.commit());
			}
		}
		retained.object.position.copy(
			ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z),
		);
	},
};

// ── images: decoded once per renderer scope, billboard planes ────────────
// (data.position.x, data.position.y) is the picture's CENTER like Rect; both
// dimensions set draw at that size, else the natural decoded size; a lone
// dimension is ignored.

const image: EntityRenderer<Entity.EntityByTag<"Image">> = {
	build: (leaf, ctx) => {
		const material = new THREE.MeshBasicNodeMaterial();
		material.transparent = true;
		material.side = THREE.DoubleSide;
		const mesh = new THREE.Mesh(unitPlane, material);
		const retained: Retained = {
			object: mesh,
			billboard: true,
			// textures are store-owned (disposed with the renderer scope)
			dispose: () => material.dispose(),
		};
		image.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const mesh = retained.object as THREE.Mesh;
		const material = mesh.material as THREE.MeshBasicNodeMaterial;
		const data = leaf.data;
		const applySize = (natural: { width: number; height: number }) => {
			const both = data.width !== undefined && data.height !== undefined;
			mesh.scale.set(
				both ? (data.width as number) : natural.width,
				both ? (data.height as number) : natural.height,
				1,
			);
		};
		if (mesh.userData.imageId !== data.image.id) {
			mesh.userData.imageId = data.image.id;
			mesh.visible = false;
			ctx.waitFor(
				Images.ready(ctx.images, data.image.id).pipe(
					Effect.flatMap((decoded) =>
						Effect.sync(() => {
							material.map = decoded.texture;
							material.needsUpdate = true;
							mesh.userData.natural = {
								width: decoded.width,
								height: decoded.height,
							};
							applySize(mesh.userData.natural);
							mesh.visible = material.opacity > 0;
						}),
					),
				),
			);
		} else if (mesh.userData.natural !== undefined) {
			applySize(mesh.userData.natural as { width: number; height: number });
		}
		material.opacity = data.opacity;
		if (mesh.userData.natural !== undefined) {
			mesh.visible = data.opacity > 0;
		}
		mesh.position.copy(ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z));
	},
};

// ── particles: one instanced unit-circle mesh per field ──────────────────
// The whole field billboards as one plane at its anchor (matching the
// ThorVG billboard semantics); per-particle position/size/color/alpha ride
// on instanced attributes. Capacity fixed at build from the buffer length.

// ponytail: particles are outside the entity union (design D10) — their
// renderer reads the legacy data shape until the system is rewritten
type ParticleFieldData = typeof ParticleField.data.Type;

const particleField: EntityRenderer<ParticleFieldData> = {
	build: (leaf, ctx) => {
		const capacity = Math.max(
			1,
			(leaf.data.buffer as ReadonlyArray<unknown>).length,
		);
		const geometry = new THREE.InstancedBufferGeometry();
		geometry.setAttribute("position", unitCircle.getAttribute("position"));
		const circleIndex = unitCircle.getIndex();
		if (circleIndex !== null) {
			geometry.setIndex(circleIndex);
		}
		geometry.setAttribute(
			"particleOffset",
			new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
		);
		geometry.setAttribute(
			"particleColor",
			new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4),
		);
		geometry.instanceCount = 0;
		const material = new THREE.MeshBasicNodeMaterial();
		material.transparent = true;
		material.side = THREE.DoubleSide;
		// ponytail: TSL typing quarantined (see Text.ts) — offset.xy shifts
		// the unit circle, offset.z scales it, color.a multiplies opacity
		interface Node {
			readonly x: Node;
			readonly y: Node;
			readonly z: Node;
			readonly a: Node;
			readonly rgb: Node;
			mul(v: unknown): Node;
			add(v: unknown): Node;
		}
		type Fn = (...args: ReadonlyArray<unknown>) => Node;
		const t = Tsl as unknown as {
			attribute: Fn;
			vec3: Fn;
			vec4: Fn;
			positionGeometry: Node;
		};
		const offset = t.attribute("particleOffset", "vec3");
		const color = t.attribute("particleColor", "vec4");
		material.positionNode = t.vec3(
			t.positionGeometry.x.mul(offset.z).add(offset.x),
			t.positionGeometry.y.mul(offset.z).add(offset.y),
			0,
		) as never;
		material.colorNode = t.vec4(color.rgb, color.a) as never;
		const mesh = new THREE.Mesh(geometry, material);
		mesh.frustumCulled = false;
		const retained: Retained = {
			object: mesh,
			billboard: true,
			dispose: () => {
				geometry.dispose();
				material.dispose();
			},
		};
		particleField.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const mesh = retained.object as THREE.Mesh;
		const geometry = mesh.geometry as THREE.InstancedBufferGeometry;
		const data = leaf.data;
		const offsets = geometry.getAttribute(
			"particleOffset",
		) as THREE.InstancedBufferAttribute;
		const colors = geometry.getAttribute(
			"particleColor",
		) as THREE.InstancedBufferAttribute;
		let count = 0;
		for (const p of data.buffer as ReadonlyArray<Particle>) {
			if (!p.alive) {
				continue;
			}
			const radius = renderSize(p, data.sizeOverLife as OverLife | undefined);
			if (radius <= 0) {
				continue;
			}
			const alpha =
				renderOpacity(p, data.opacityOverLife as OverLife | undefined) *
				data.opacity;
			if (alpha <= 0) {
				continue;
			}
			if (count >= offsets.count) {
				break;
			}
			// local offsets pass through (scene space = three local space);
			// the mesh itself sits at the field's anchor
			offsets.setXYZ(count, p.x, p.y, radius);
			const { r, g, b } = Color.bytes(p.color);
			colors.setXYZW(count, r / 255, g / 255, b / 255, alpha);
			count++;
		}
		offsets.needsUpdate = true;
		colors.needsUpdate = true;
		geometry.instanceCount = count;
		mesh.visible = count > 0;
		mesh.position.copy(ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z));
	},
};

// ── staged gaps: loud, never silent ──────────────────────────────────────

// containers never reach leaf rendering — the frame walk composes them
const container = <T>(name: string): EntityRenderer<T> => ({
	build: (leaf: Leaf<T>) => {
		throw new Error(
			`${name} is a container and must be composed by the frame walk, not rendered as a leaf — instance "${leaf.id}" (renderer walk bug)`,
		);
	},
	update: () => {},
});

/**
 * The exhaustive renderer map for every built-in entity. Typed
 * `EntityRenderers<...>` so a missing built-in fails to type-check — the
 * same coverage-manifest guarantee `builtinPaints` gives the ThorVG path.
 */
/**
 * A renderer slot for an entity that never reaches the walk. Dying loudly
 * beats a silent no-op: if one of these is ever invoked, the frame contract
 * changed and we want to hear about it.
 */
const neverRendered = <T>(tag: string): EntityRenderer<T> =>
	({
		build: () => {
			throw new Error(`Renderer: ${tag} is not renderable`);
		},
		update: () => {
			throw new Error(`Renderer: ${tag} is not renderable`);
		},
		dispose: () => {},
	}) as unknown as EntityRenderer<T>;

/**
 * The renderer for every built-in entity kind.
 *
 * @remarks
 * Typed as an exhaustive map, so adding an entity to the core library
 * without a renderer here fails the build rather than silently drawing
 * nothing.
 *
 * To change how a kind is drawn, pass a replacement in the `renderers`
 * option of `Renderer.make` or the Node adapter's `make` — it is merged over
 * this map by tag — rather than editing this manifest.
 */
export const builtinRenderers: EntityRenderers = {
	Circle: circle,
	Ellipse: ellipse,
	Rect: rect,
	Line: line,
	Path: path,
	Text: text,
	Group: container("Group"),
	Hud: container("Hud"),
	Image: image,
	// the camera is view state and never painted; it is omitted from the
	// frame's instance map, so this entry is unreachable by construction —
	// it exists only to satisfy exhaustiveness over the tag union
	Camera: neverRendered("Camera"),
};

/**
 * The manifest widened for registry use. The single variance cast lives
 * here: `EntityRenderers` keys each renderer by its exact entity data (so
 * coverage over the tag union stays a compile-time guarantee above), while
 * a registry is keyed by string — contravariant `build`/`update` parameters
 * make that narrowing inexpressible without the cast.
 *
 * ponytail: the ParticleField entry is the D10 escape hatch. It is the ONE
 * key here that is not a member of the entity union, added explicitly rather
 * than by leaving the registry open. Delete it with the particles rewrite.
 */
/**
 * {@link builtinRenderers} as the loosely-typed map the renderer's registry
 * actually holds, keyed by entity tag.
 *
 * @remarks
 * Same contents, widened: a heterogeneous registry cannot be read at any one
 * entity type. Custom renderers are merged over this.
 */
export const builtinRegistry: Record<string, EntityRenderer<never>> = {
	...(builtinRenderers as unknown as Record<string, EntityRenderer<never>>),
	[Runner.PARTICLE_FIELD_TAG]:
		particleField as unknown as EntityRenderer<never>,
};
