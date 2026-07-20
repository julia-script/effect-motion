import { Line2 as FatLine, THREE, Tsl } from "@effect-motion/three";
import { Effect } from "effect";
import { Color, Shapes } from "effect-motion";
import type * as Entity from "effect-motion/Entity";
import { renderOpacity, renderSize } from "effect-motion/particles/overLife";
import type { OverLife, Particle } from "effect-motion/particles/Particle";
import { ParticleField } from "effect-motion/particles/ParticleField";
import type { PathCommand } from "effect-motion/shapes/Path";
import type {
	EntityRenderer,
	EntityRenderers,
	Leaf,
	RenderContext,
	Retained,
} from "./EntityRenderer.js";
import * as Images from "./Images.js";
import * as Text from "./Text.js";

/**
 * Built-in entity renderers: the retained (`build`/`update`/`dispose`) port
 * of the ThorVG paint manifest. Flat unlit look — MeshBasicNodeMaterial for
 * fills, Line2NodeMaterial with world-unit widths for strokes (stroke width
 * is a world-space dimension foreshortened per-pixel by perspective; this
 * intentionally replaces ThorVG's one-scale-per-segment approximation).
 */

const CIRCLE_SEGMENTS = 64;

// shared unit geometries — shapes scale them, so there are no per-frame
// geometry rebuilds for circles/ellipses/rects at all
const unitCircle = new THREE.CircleGeometry(1, CIRCLE_SEGMENTS);
// unit plane with its origin at the TOP-LEFT corner (scene rect anchor):
// in three coords the rect extends +x and -y from the anchor
const unitPlane = new THREE.PlaneGeometry(1, 1);
unitPlane.translate(0.5, -0.5, 0);

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
	outline: FatLine.Line2 | null;
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
				disposeFatLine(parts.outline);
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
	data: { stroke?: Color.Color; strokeWidth?: number; opacity: number },
	points: ReadonlyArray<readonly [number, number]> | null,
): void => {
	if (data.stroke === undefined || points === null) {
		if (parts.outline !== null) {
			parts.group.remove(parts.outline);
			disposeFatLine(parts.outline);
			parts.outline = null;
		}
		return;
	}
	if (parts.outline === null) {
		parts.outline = makeFatLine();
		parts.group.add(parts.outline);
	}
	const material = parts.outline.material as THREE.Line2NodeMaterial;
	setColor(material, data.stroke, data.opacity);
	material.linewidth = data.strokeWidth ?? 1;
	const positions: Array<number> = [];
	for (const [x, y] of points) {
		positions.push(x, y, 0);
	}
	const first = points[0];
	if (first !== undefined) {
		positions.push(first[0], first[1], 0);
	}
	parts.outline.geometry.dispose();
	parts.outline.geometry = new FatLine.LineGeometry();
	parts.outline.geometry.setPositions(positions);
	parts.outline.computeLineDistances();
	parts.outline.visible = material.opacity > 0;
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

// rect outline/fill points in the top-left-anchored local frame (+x, -y)
const rectPoints = (
	width: number,
	height: number,
	rx: number,
	ry: number,
): Array<readonly [number, number]> => {
	if (rx <= 0 || ry <= 0) {
		return [
			[0, 0],
			[width, 0],
			[width, -height],
			[0, -height],
		];
	}
	const cx = Math.min(rx, width / 2);
	const cy = Math.min(ry, height / 2);
	const points: Array<readonly [number, number]> = [];
	const STEPS = 8;
	const corner = (
		centerX: number,
		centerY: number,
		startAngle: number,
	): void => {
		for (let i = 0; i <= STEPS; i++) {
			const a = startAngle + (i / STEPS) * (Math.PI / 2);
			points.push([centerX + Math.cos(a) * cx, centerY + Math.sin(a) * cy]);
		}
	};
	// counterclockwise in the y-up local frame, starting at the top-right arc
	corner(width - cx, -cy, 0);
	corner(cx, -cy, Math.PI / 2);
	corner(cx, -(height - cy), Math.PI);
	corner(width - cx, -(height - cy), Math.PI * 1.5);
	return points;
};

const polygonGeometry = (
	points: ReadonlyArray<readonly [number, number]>,
): THREE.BufferGeometry => {
	const contour = points.map(([x, y]) => new THREE.Vector2(x, y));
	const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
	const positions = new Float32Array(points.length * 3);
	for (const [i, [x, y]] of points.entries()) {
		positions[i * 3] = x;
		positions[i * 3 + 1] = y;
	}
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(positions, 3),
	);
	geometry.setIndex(triangles.flat());
	return geometry;
};

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

const circle: EntityRenderer<typeof Shapes.Circle> = {
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
			leaf.data.fill,
			leaf.data.opacity,
		);
		parts.mesh.scale.set(leaf.data.radius, leaf.data.radius, 1);
		setOutline(
			parts,
			leaf.data,
			leaf.data.stroke !== undefined
				? ellipsePoints(leaf.data.radius, leaf.data.radius)
				: null,
		);
	},
};

const ellipse: EntityRenderer<typeof Shapes.Ellipse> = {
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
			leaf.data.fill,
			leaf.data.opacity,
		);
		parts.mesh.scale.set(leaf.data.rx, leaf.data.ry, 1);
		setOutline(
			parts,
			leaf.data,
			leaf.data.stroke !== undefined
				? ellipsePoints(leaf.data.rx, leaf.data.ry)
				: null,
		);
	},
};

const square: EntityRenderer<typeof Shapes.Square> = {
	build: (leaf, ctx) => {
		const { retained } = buildFillGroup();
		square.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const parts = placeFillGroup(
			retained,
			leaf,
			ctx,
			leaf.data.fill,
			leaf.data.opacity,
		);
		parts.mesh.scale.set(leaf.data.size, leaf.data.size, 1);
		setOutline(
			parts,
			leaf.data,
			leaf.data.stroke !== undefined
				? rectPoints(leaf.data.size, leaf.data.size, 0, 0)
				: null,
		);
	},
};

const rect: EntityRenderer<typeof Shapes.Rect> = {
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
			leaf.data.fill,
			leaf.data.opacity,
		);
		const data = leaf.data;
		// SVG lone-radius semantics: one set radius applies to both axes
		const rx = data.rx ?? data.ry ?? 0;
		const ry = data.ry ?? data.rx ?? 0;
		const rounded = rx > 0 && ry > 0;
		const key = `${data.width}|${data.height}|${rx}|${ry}`;
		if (rounded) {
			// per-instance rounded geometry, rebuilt when the params change
			// (rounding radii tween like any numerics)
			if (parts.mesh.userData.rectKey !== key) {
				parts.mesh.userData.rectKey = key;
				setFillGeometry(
					parts,
					polygonGeometry(rectPoints(data.width, data.height, rx, ry)),
				);
			}
			parts.mesh.scale.set(1, 1, 1);
		} else {
			parts.mesh.userData.rectKey = key;
			setFillGeometry(parts, unitPlane);
			parts.mesh.scale.set(data.width, data.height, 1);
		}
		setOutline(
			parts,
			data,
			data.stroke !== undefined
				? rectPoints(data.width, data.height, rx, ry)
				: null,
		);
		const { rotX, rotY, rotZ } = data;
		const tilted = rotX !== 0 || rotY !== 0 || rotZ !== 0;
		retained.billboard = !tilted;
		if (tilted) {
			// object-rotation conjugation (scene y-down → three y-up):
			// R_three = Rz(-rz)·Ry(ry)·Rx(-rx), three Euler order "ZYX"
			parts.group.rotation.order = "ZYX";
			parts.group.rotation.set(-rotX, rotY, -rotZ);
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

const line: EntityRenderer<typeof Shapes.Line> = {
	build: (leaf, ctx) => {
		const fatLine = makeFatLine();
		const retained: Retained = {
			object: fatLine,
			billboard: false,
			dispose: () => disposeFatLine(fatLine),
		};
		line.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const fatLine = retained.object as FatLine.Line2;
		const material = fatLine.material as THREE.Line2NodeMaterial;
		setColor(material, leaf.data.stroke, leaf.data.opacity);
		material.linewidth = leaf.data.strokeWidth;
		fatLine.visible = material.opacity > 0;
		const a = ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z);
		// x2/y2/z2 compose the same ancestor offset as the anchor: recover
		// the offset from world - local, then apply it to the endpoint
		const ox = leaf.world.x - leaf.data.x;
		const oy = leaf.world.y - leaf.data.y;
		const oz = leaf.world.z - leaf.data.z;
		const b = ctx.toThree(
			ox + leaf.data.x2,
			oy + leaf.data.y2,
			oz + leaf.data.z2,
		);
		fatLine.geometry.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
		fatLine.computeLineDistances();
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

// ponytail: rebuilt wholesale whenever the path changes (geometry churn
// accepted — acceptance paths are static). Closed subpaths fill with the
// path's fill color, triangulated in x/y with per-vertex z applied after
// (earcut only uses the input vertices, so mildly non-planar subpaths keep
// their depths). Holes are not supported — each closed subpath fills
// independently (winding analysis is a later concern).
const path: EntityRenderer<typeof Shapes.Path> = {
	build: (leaf, ctx) => {
		const group = new THREE.Group();
		const retained: Retained = {
			object: group,
			billboard: false,
			dispose: () => {
				for (const child of [...group.children]) {
					disposePathChild(child);
				}
			},
		};
		path.update(retained, leaf, ctx);
		return retained;
	},
	update: (retained, leaf, ctx) => {
		const group = retained.object as THREE.Group;
		for (const child of [...group.children]) {
			group.remove(child);
			disposePathChild(child);
		}
		const { stroke, fill, opacity } = leaf.data;
		const strokeWidth = leaf.data.strokeWidth ?? 1;
		const subpaths = pathSubpaths(leaf.data.commands, leaf.world);
		for (const subpath of subpaths) {
			// fill: closed subpaths only, triangulated in x/y
			if (subpath.closed && subpath.points.length >= 3) {
				const contour = subpath.points.map((p) => new THREE.Vector2(p.x, -p.y));
				const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
				const positions = new Float32Array(subpath.points.length * 3);
				for (const [i, p] of subpath.points.entries()) {
					const v = ctx.toThree(p.x, p.y, p.z);
					positions[i * 3] = v.x;
					positions[i * 3 + 1] = v.y;
					positions[i * 3 + 2] = v.z;
				}
				const geometry = new THREE.BufferGeometry();
				geometry.setAttribute(
					"position",
					new THREE.Float32BufferAttribute(positions, 3),
				);
				geometry.setIndex(triangles.flat());
				const material = new THREE.MeshBasicNodeMaterial();
				material.side = THREE.DoubleSide;
				setColor(material, fill, opacity);
				const mesh = new THREE.Mesh(geometry, material);
				mesh.visible = material.opacity > 0;
				group.add(mesh);
			}
			// stroke: world-unit fat polyline
			if (stroke !== undefined) {
				const fatLine = makeFatLine();
				const material = fatLine.material as THREE.Line2NodeMaterial;
				setColor(material, stroke, opacity);
				material.linewidth = strokeWidth;
				fatLine.visible = material.opacity > 0;
				const positions: Array<number> = [];
				const push = (p: { x: number; y: number; z: number }) => {
					const v = ctx.toThree(p.x, p.y, p.z);
					positions.push(v.x, v.y, v.z);
				};
				for (const p of subpath.points) {
					push(p);
				}
				const first = subpath.points[0];
				if (
					subpath.closed &&
					subpath.points.length > 1 &&
					first !== undefined
				) {
					push(first);
				}
				fatLine.geometry.setPositions(positions);
				fatLine.computeLineDistances();
				group.add(fatLine);
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
// Layout is async (typesetting + first-sight glyph SDF generation) and
// registered with ctx.waitFor, so the render path never presents a
// half-built string. The mesh billboards and scales with perspective like
// the other billboard shapes.

const text: EntityRenderer<typeof Shapes.Text> = {
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
		if (retained.object.userData.textKey !== key) {
			retained.object.userData.textKey = key;
			ctx.waitFor(
				Text.layout(ctx.text, {
					text: data.text,
					fontId: data.fontFamily.id,
					fontSize: data.fontSize,
					textAnchor: data.textAnchor,
					baseline: data.baseline,
				}).pipe(Effect.map((quads) => textMesh.setQuads(quads))),
			);
		}
		const { r, g, b, a } = Color.bytes(data.fill);
		textMesh.setColor(r, g, b, (a / 255) * data.opacity);
		retained.object.position.copy(
			ctx.toThree(leaf.world.x, leaf.world.y, leaf.world.z),
		);
	},
};

// ── images: decoded once per renderer scope, billboard planes ────────────
// (data.x, data.y) is the top-left like Rect; both dimensions set draw at
// that size, else the natural decoded size; a lone dimension is ignored.

const image: EntityRenderer<typeof Shapes.Image> = {
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

const particleField: EntityRenderer<typeof ParticleField> = {
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
			// local offsets in scene orientation: y flips into the billboard's
			// y-up local space; the mesh itself sits at the field's anchor
			offsets.setXYZ(count, p.x, -p.y, radius);
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

const _notPorted = (what: string, stage: string): EntityRenderer<never> => ({
	build: (leaf: Leaf) => {
		throw new Error(
			`${what} is not yet ported to the three renderer (${stage}) — instance "${leaf.id}"`,
		);
	},
	update: () => {},
});

// containers never reach leaf rendering — the frame walk composes them
const container = (name: string): EntityRenderer<never> => ({
	build: (leaf: Leaf) => {
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
export const builtinRenderers = {
	[Shapes.Circle.name]: circle,
	[Shapes.Ellipse.name]: ellipse,
	[Shapes.Square.name]: square,
	[Shapes.Rect.name]: rect,
	[Shapes.Line.name]: line,
	[Shapes.Path.name]: path,
	[Shapes.Text.name]: text,
	[Shapes.Group.name]: container("Group"),
	[Shapes.Hud.name]: container("Hud"),
	[Shapes.Image.name]: image,
	[ParticleField.name]: particleField,
} as EntityRenderers<
	| typeof Shapes.Circle
	| typeof Shapes.Ellipse
	| typeof Shapes.Square
	| typeof Shapes.Rect
	| typeof Shapes.Line
	| typeof Shapes.Path
	| typeof Shapes.Text
	| typeof Shapes.Group
	| typeof Shapes.Hud
	| typeof Shapes.Image
	| typeof ParticleField
>;

/**
 * The manifest widened for registry use. The single variance cast lives
 * here: `EntityRenderers` keys each renderer by its exact entity (so
 * coverage stays a compile-time guarantee above), while a registry holds
 * `EntityRenderer<AnyEntity>` — contravariant `build`/`update` parameters
 * make that narrowing inexpressible without the cast.
 */
export const builtinRegistry: Record<
	string,
	EntityRenderer<Entity.AnyEntity>
> = builtinRenderers as unknown as Record<
	string,
	EntityRenderer<Entity.AnyEntity>
>;
