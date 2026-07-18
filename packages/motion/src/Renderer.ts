import type {
	OwnedPaint,
	RenderSession,
	ThorvgException,
	ThorvgWasm,
} from "@effect-motion/thorvg";
import * as Tvg from "@effect-motion/thorvg";
import type { Canvas } from "@effect-motion/thorvg/Canvas";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import * as CameraMod from "./Camera.js";
import * as Color from "./Color.js";
import type * as Entity from "./Entity.js";
import * as Projection from "./Projection.js";
import { circleOfConfusion, quantizeSigma } from "./render/dof.js";
import { builtinPaints } from "./render/shapes.js";
import type { EntriesFromEntities, Frame } from "./Scene.js";
import { Hud } from "./shapes/Hud.js";

/**
 * The projection handed to each paint function — how the camera places a
 * paintable this frame. `screen` is the projected billboard placement (an
 * affine the paint fn applies via `setTransform`); `depth` is the view-space
 * sort key; `scale` is the perspective scale (<= 0 means the anchor is behind
 * the camera — cull, unless a `quad` or `segment` is present). `quad`, when
 * present, is the projected, near-plane-clipped screen polygon of a tilted
 * plane (3–5 vertices — see Projection.projectPlane); a shape that can tilt
 * paints an exact path from these instead of applying the billboard affine.
 * `segment`, when present, is the exact projected screen endpoints of a
 * skeletal shape (Line) — each endpoint carries its own world depth, so the
 * pair is projected per point (see Projection.projectSegment) and the paint
 * fn draws it directly, skipping the billboard affine. `subpaths`, when
 * present, is the projected screen geometry of a skeletal path (Path): every
 * command point projected individually and near-plane-clipped per subpath
 * (see Projection.projectPath) — the paint fn emits it directly at screen
 * coordinates.
 */
export interface PaintProjection {
	readonly screen: Projection.Affine;
	readonly depth: number;
	readonly scale: number;
	readonly quad?: ReadonlyArray<Projection.Vec2>;
	readonly segment?: readonly [Projection.Vec2, Projection.Vec2];
	readonly subpaths?: Projection.ProjectedPath["subpaths"];
}

/** The frame's render metadata, handed to paint functions. */
export interface FrameMeta {
	readonly frameRate: number;
	readonly width: number;
	readonly height: number;
	readonly backgroundColor: Color.Color;
	/**
	 * the active camera's view — world position `{x, y, z}`, Euler
	 * orientation `{rotX, rotY, rotZ}`, and `focalLength` (FOV). The renderer
	 * projects every instance through it. The resting camera (see
	 * Camera.identity) reproduces plain-2D placement for z=0 content.
	 */
	readonly camera: {
		readonly x: number;
		readonly y: number;
		readonly z: number;
		readonly rotX: number;
		readonly rotY: number;
		readonly rotZ: number;
		readonly focalLength: number;
	};
}

/**
 * Paints one entity instance onto the shared ThorVG scene. It issues ThorVG
 * C-API calls (make a shape, append geometry, style it, apply the projection,
 * add it to `scene`) — there is no intermediate description value. A container
 * (Group / root) paints nothing itself; its position has already composed into
 * its children's world coordinates by the time this is called.
 */
export type PaintFunction<Ent extends Entity.AnyEntity> = (payload: {
	readonly entity: Ent;
	readonly id: string;
	readonly data: Ent["data"]["Type"];
	readonly projection: PaintProjection;
	readonly canvas: Canvas;
	readonly scene: OwnedPaint;
	readonly meta: FrameMeta;
}) => Effect.Effect<
	void,
	ThorvgException,
	ThorvgWasm | RenderSession | Scope.Scope
>;

/**
 * A registry of paint functions keyed by entity name. `PaintFunctions<E>` is
 * the exhaustive map over an entity union — a built-in with no paint function
 * is a type error at the render call, not a runtime surprise (the old
 * "coverage manifest" guarantee, kept without a Context registry).
 */
export type PaintFunctions<Entities extends Entity.AnyEntity> = {
	readonly [K in Entities as K["name"]]: PaintFunction<K>;
};

// in frame data, a `children: string[]` field means child instance ids
const childIdsOf = (data: unknown): ReadonlyArray<string> => {
	const children = (data as { children?: unknown } | null)?.children;
	return Array.isArray(children) ? children : [];
};

// the structural shape of a Path command in frame data (see shapes/Path.ts)
type PathCommandData =
	| {
			readonly _tag: "M" | "L";
			readonly x: number;
			readonly y: number;
			readonly z?: number;
	  }
	| { readonly _tag: "Z" };

/**
 * Split a Path's command list into world-space subpaths: `M` starts one,
 * `L` extends it, `Z` closes it. Command points are LOCAL to the path's
 * anchor; `z` absent means 0. An `L` directly after a `Z` starts a new open
 * subpath from the closed subpath's start point (SVG semantics).
 */
const pathSubpaths = (
	commands: ReadonlyArray<PathCommandData>,
	anchor: Projection.Vec3,
): Array<Projection.Subpath3> => {
	const subpaths: Array<Projection.Subpath3> = [];
	let current: Array<Projection.Vec3> = [];
	let lastMove: Projection.Vec3 = anchor;
	const world = (p: {
		readonly x: number;
		readonly y: number;
		readonly z?: number;
	}): Projection.Vec3 => ({
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

// a hidden instance ($visible false) and its subtree are skipped entirely
const isVisible = <Entities extends Entity.AnyEntity>(
	frame: Frame<Entities>,
	id: string,
): boolean => frame.instances[id]?.$visible !== false;

/**
 * Fold a frame onto the shared ThorVG canvas + scene: flatten the instance
 * tree to a depth-sorted draw list, project each paintable through the
 * frame's camera, and paint far→near. The pipeline (flatten, world-offset
 * composition, projection, quad, stable-id depth sort, visibility skip,
 * cycle/duplicate defects) is target-agnostic; only the per-entity paint is
 * ThorVG-specific.
 */
const renderToCanvas = <const Entities extends Entity.AnyEntity>(
	frame: Frame<Entities>,
	canvas: Canvas,
	scene: OwnedPaint,
	// blur sigmas are canvas-pixel amounts; the scene is authored in logical
	// units, so depth-of-field scales them by the device-pixel ratio
	dpr = 1,
): Effect.Effect<
	void,
	ThorvgException,
	ThorvgWasm | RenderSession | Scope.Scope
> =>
	Effect.gen(function* () {
		interface Paintable {
			readonly id: string;
			readonly entry: EntriesFromEntities<Entities>;
			readonly projection: PaintProjection;
			/** identity-projected screen-space content — paints in the top tier */
			readonly hud: boolean;
		}
		const origin: Projection.Vec2 = {
			x: frame.width / 2,
			y: frame.height / 2,
		};
		// the effective view: a camera with a point of interest auto-orients
		// toward it here (explicit Euler composes after — see resolveCamera);
		// the frame's camera data is never mutated
		const camera = Projection.resolveCamera(frame.camera, origin);
		// HUD subtrees project through the identity camera: camera-independent
		// placement, and structurally exempt from depth of field (aperture 0)
		const identityCamera = CameraMod.identity(frame.width);
		const visited = new Set<string>();
		const paintables: Paintable[] = [];

		// Flatten the tree to a draw list. A container (a node with a
		// `children` field) is NOT a paint-order boundary: its position
		// composes into its children's world coordinates, and each child is
		// emitted into the same flat list. `offset` is the accumulated world
		// translation from ancestor containers. `hud` marks an ancestor Hud:
		// the subtree projects through the identity camera and paints in the
		// top tier. `inWorldContainer` marks any ordinary container above —
		// a Hud there would compose world offsets into screen coordinates,
		// which is incoherent and dies loudly.
		const flatten = (
			id: string,
			offset: Projection.Vec3,
			hud: boolean,
			inWorldContainer: boolean,
		): Effect.Effect<void> =>
			Effect.gen(function* () {
				if (visited.has(id)) {
					return yield* Effect.die(
						new Error(
							`Renderer: instance "${id}" is referenced more than once (duplicate parent or cycle)`,
						),
					);
				}
				visited.add(id);
				const entry = frame.instances[id];
				if (entry === undefined) {
					return yield* Effect.die(
						new Error(`Renderer: unknown instance id "${id}"`),
					);
				}
				const isHud = entry.entity.name === Hud.name;
				if (isHud && inWorldContainer) {
					return yield* Effect.die(
						new Error(
							`Renderer: Hud "${id}" is nested inside world content — a Hud must be a top-level child of the root (or of another Hud)`,
						),
					);
				}
				const subtreeHud = hud || isHud;
				const effectiveCamera = subtreeHud ? identityCamera : camera;
				const data = entry.data as Partial<Projection.Vec3> & {
					children?: unknown;
					width?: number;
					height?: number;
					rotX?: number;
					rotY?: number;
					rotZ?: number;
					x2?: number;
					y2?: number;
					z2?: number;
					commands?: unknown;
				};
				// world anchor = ancestor offset + this node's own position
				const world: Projection.Vec3 = {
					x: offset.x + (data.x ?? 0),
					y: offset.y + (data.y ?? 0),
					z: offset.z + (data.z ?? 0),
				};
				const childIds = childIdsOf(entry.data).filter((childId) =>
					isVisible(frame, childId),
				);
				if (childIds.length > 0) {
					// a pure container: contribute position, recurse, paint
					// nothing itself (the root, Groups, Huds). ponytail: only
					// translation composes down — a Group's 2D affine transform
					// is not yet threaded into child world coords.
					yield* Effect.all(
						childIds.map((childId) =>
							flatten(
								childId,
								world,
								subtreeHud,
								inWorldContainer || !subtreeHud,
							),
						),
					);
					return;
				}
				// a skeletal path leaf (Path): every command point is an
				// independent world point (anchor + local), projected per point
				// with per-subpath near-plane clipping — the paint fn emits the
				// exact screen subpaths. ponytail: no viewport clip yet — ThorVG
				// stroke cost scales with the path's full extent, offscreen
				// included; upgrade is per-span clipSegmentToRect with the same
				// splitting the near clip uses.
				if (Array.isArray(data.commands)) {
					const projected = Projection.projectPath(
						effectiveCamera,
						pathSubpaths(
							data.commands as ReadonlyArray<PathCommandData>,
							world,
						),
						origin,
					);
					if (projected === undefined) {
						// entirely behind the near plane — cull
						return;
					}
					// anchor the billboard affine on the first visible point, as
					// the segment branch does — path paints ignore it (their
					// geometry is already screen-space) but the field stays coherent
					const first = projected.subpaths[0]?.points[0] ?? origin;
					paintables.push({
						id,
						entry,
						projection: {
							screen: Projection.billboardAffine(
								{
									x: first.x,
									y: first.y,
									depth: projected.depth,
									scale: projected.scale,
								},
								{ x: data.x ?? 0, y: data.y ?? 0 },
							),
							depth: projected.depth,
							scale: projected.scale,
							subpaths: projected.subpaths,
						},
						hud: subtreeHud,
					});
					return;
				}
				// a skeletal leaf (Line): both endpoints are independent world
				// points — project the pair per point (near-plane-clipped) and
				// hand the exact screen segment to the paint fn. Unconditional
				// for any x2/y2 leaf: the identity invariant makes the flat
				// case pixel-identical to the old billboard path.
				if (typeof data.x2 === "number" && typeof data.y2 === "number") {
					const seg = Projection.projectSegment(
						effectiveCamera,
						world,
						{
							x: offset.x + data.x2,
							y: offset.y + data.y2,
							z: offset.z + (data.z2 ?? 0),
						},
						origin,
					);
					if (seg === undefined) {
						// entirely behind the near plane — cull
						return;
					}
					// clip to the viewport before painting: ThorVG stroke cost
					// scales with the path's full extent, offscreen included.
					// The margin covers the scaled stroke (caps/joins) so the
					// visible pixels are untouched by the clip.
					const strokeMargin =
						((entry.data as { strokeWidth?: number }).strokeWidth ?? 1) *
							seg.scale +
						1;
					const clipped = Projection.clipSegmentToRect(
						seg.a,
						seg.b,
						{ x: -strokeMargin, y: -strokeMargin },
						{
							x: frame.width + strokeMargin,
							y: frame.height + strokeMargin,
						},
					);
					if (clipped === undefined) {
						// entirely offscreen — cull
						return;
					}
					// ponytail: one depth/scale for the whole segment (its
					// visible midpoint) — a depth-spanning line blurs and sorts
					// as one unit, the same ceiling as a tilted plane's quad.
					// Upgrade: split the segment where its (linear) view depth
					// crosses DoF bucket boundaries → gradient blur along the
					// line plus per-piece sort keys.
					paintables.push({
						id,
						entry,
						projection: {
							screen: Projection.billboardAffine(
								{ x: seg.a.x, y: seg.a.y, depth: seg.depth, scale: seg.scale },
								{ x: data.x ?? 0, y: data.y ?? 0 },
							),
							depth: seg.depth,
							scale: seg.scale,
							segment: clipped,
						},
						hud: subtreeHud,
					});
					return;
				}
				// a leaf paintable: project its world anchor for placement +
				// depth, but anchor the billboard affine on the shape's own
				// LOCAL coordinates — the shape paints at local (data.x/y), so
				// the transform maps local → screen. The composed ancestor
				// offset lives in the transform's translation.
				const proj = Projection.project(effectiveCamera, world, origin);
				// A rectangular plane with any nonzero rotation tilts: project
				// its four corners so the paint fn can emit an exact path. The
				// pivot is the plane's world anchor, so rotation spins it in
				// place. Billboards (no rotation, or non-rect shapes) skip this.
				const rotX = data.rotX ?? 0;
				const rotY = data.rotY ?? 0;
				const rotZ = data.rotZ ?? 0;
				const tilted =
					(rotX !== 0 || rotY !== 0 || rotZ !== 0) &&
					data.width !== undefined &&
					data.height !== undefined;
				const quad = tilted
					? Projection.projectPlane(
							effectiveCamera,
							Projection.planeCorners(
								{
									x: data.x ?? 0,
									y: data.y ?? 0,
									width: data.width as number,
									height: data.height as number,
								},
								{ rotX, rotY, rotZ },
								world,
							),
							origin,
						)
					: undefined;
				if (quad !== undefined && quad.length < 3) {
					// the tilted plane is entirely behind the near plane — cull
					return;
				}
				paintables.push({
					id,
					entry,
					projection: {
						screen: Projection.billboardAffine(proj, {
							x: data.x ?? 0,
							y: data.y ?? 0,
						}),
						depth: proj.depth,
						scale: proj.scale,
						...(quad !== undefined ? { quad } : {}),
					},
					hud: subtreeHud,
				});
			});

		const rootEntry = frame.instances[frame.root];
		if (rootEntry === undefined) {
			return yield* Effect.die(
				new Error(`Renderer: missing root instance "${frame.root}"`),
			);
		}
		visited.add(frame.root);
		yield* Effect.all(
			childIdsOf(rootEntry.data)
				.filter((childId) => isVisible(frame, childId))
				.map((childId) => flatten(childId, { x: 0, y: 0, z: 0 }, false, false)),
		);

		// painter's order: two tiers — world content by depth (farthest
		// first), then HUD content by depth among itself, each with a stable
		// id tie-break so equal-depth paintables paint deterministically.
		// ponytail: naive O(n log n) per frame — swap for a spatial structure
		// only if a scene with thousands of objects proves it.
		paintables.sort(
			(a, b) =>
				(a.hud ? 1 : 0) - (b.hud ? 1 : 0) ||
				b.projection.depth - a.projection.depth ||
				(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
		);

		const meta: FrameMeta = {
			frameRate: frame.frameRate,
			width: frame.width,
			height: frame.height,
			backgroundColor: frame.backgroundColor,
			camera: frame.camera,
		};

		// Depth of field (camera-depth-of-field D3): with aperture > 0,
		// contiguous depth-sorted runs sharing a quantized blur sigma paint
		// into nested scenes that get a gaussian-blur effect; sharp runs paint
		// into the root as always, so aperture 0 (the default) takes the
		// unchanged single-scene path. Buckets are added to the root at run
		// boundaries, preserving painter's order exactly. Sigma is scaled by
		// dpr because the blur operates in canvas pixels while the scene is
		// authored in logical units.
		const aperture = frame.camera.aperture;
		let bucketScene = scene;
		let bucketSigma = 0;
		const closeBucket = Effect.gen(function* () {
			if (bucketSigma > 0) {
				// direction 0 = both axes, border 0 = duplicate, quality 75
				// (upstream default) — verified in the scene-blur spike
				yield* Tvg.Scene.addGaussianBlur(
					bucketScene,
					bucketSigma * dpr,
					0,
					0,
					75,
				);
				yield* Tvg.Scene.add(scene, bucketScene);
			}
		});

		// paint far→near. A paintable whose anchor is behind the camera
		// (scale <= 0) is culled here so paint functions never see an invalid
		// placement — EXCEPT a tilted plane carrying a quad: its polygon is
		// already near-plane-clipped, and it can be visible (near part in
		// front) while its anchor corner is behind.
		for (const { id, entry, projection, hud } of paintables) {
			if (projection.scale <= 0 && projection.quad === undefined) {
				continue;
			}
			// HUD content is structurally sharp: its effective camera is the
			// identity camera (aperture 0), so it never enters a blur bucket
			const sigma =
				aperture > 0 && !hud
					? quantizeSigma(circleOfConfusion(projection.depth, frame.camera))
					: 0;
			if (sigma !== bucketSigma) {
				yield* closeBucket;
				bucketScene = sigma === 0 ? scene : yield* Tvg.Scene.make();
				bucketSigma = sigma;
			}
			// the concrete paint fn for this entity name; the map is exhaustive
			// over Entities by construction (PaintFunctions<Entities>). The
			// specific member depends on the instance's entity, known only at
			// runtime — hence the cast to the erased paint-fn type.
			const paint: PaintFunction<Entity.AnyEntity> =
				builtinPaints[entry.entity.name as keyof typeof builtinPaints];
			if (paint === undefined) {
				return yield* Effect.die(
					new Error(
						`Renderer: no paint function for entity "${entry.entity.name}"`,
					),
				);
			}
			yield* paint({
				entity: entry.entity,
				id,
				data: entry.data,
				projection,
				canvas,
				scene: bucketScene,
				meta,
			});
		}
		yield* closeBucket;
	});

/** RGBA8888 framebuffer plus its dimensions, straight from the SW canvas. */
export interface Framebuffer {
	readonly rgba: Uint8Array;
	/** physical pixel size of the rgba buffer (logical size × dpr) */
	readonly width: number;
	readonly height: number;
	/**
	 * logical scene size — the resolution the buffer should be displayed at
	 * (CSS pixels). Equals width/height when rendered at dpr 1.
	 */
	readonly logicalWidth: number;
	readonly logicalHeight: number;
}

/**
 * Render one frame to an RGBA framebuffer, shared by both output adapters.
 *
 * Uses the RenderSession's canvas (resized in place to the frame's physical
 * size, cleared of the previous frame), adds a root scene, folds the frame
 * onto it via `Renderer.render`, then update/draw/sync and reads the SW
 * framebuffer. The scene and every painted shape are scoped per frame; the
 * canvas belongs to the session (a player mount, an export run) and is
 * deleted when the session closes.
 *
 * The background is painted as a filled rect (not a canvas clear color) so it
 * survives into the buffer the same way the SVG sink emitted a background
 * rect.
 */
export const render = (
	frame: Frame,
	options?: {
		/**
		 * device-pixel-ratio multiplier for high-dpi displays. The buffer is
		 * rasterized at `logical × dpr` while paint functions keep working in
		 * logical scene coordinates (the root scene is scaled). Callers display
		 * the buffer at the logical size. Default 1 (node/export paths).
		 */
		readonly dpr?: number;
	},
): Effect.Effect<
	Framebuffer,
	ThorvgException,
	Tvg.ThorvgWasm | Tvg.RenderSession | Scope.Scope
> =>
	Effect.gen(function* () {
		const logicalWidth = frame.width;
		const logicalHeight = frame.height;
		const dpr = options?.dpr ?? 1;
		const width = Math.round(logicalWidth * dpr);
		const height = Math.round(logicalHeight * dpr);
		const canvas = yield* Tvg.Session.canvasSized(width, height);
		const scene = yield* Tvg.Scene.make();

		// background as a filled rect covering the viewport (mirrors the SVG
		// sink's background rect; survives into the raster buffer)
		const bg = yield* Tvg.Shape.make();
		yield* Tvg.Shape.appendRect(bg, 0, 0, logicalWidth, logicalHeight);
		const { r, g, b, a } = Color.bytes(frame.backgroundColor);
		yield* Tvg.Shape.setFillColor(bg, r, g, b, a);
		yield* Tvg.Scene.add(scene, bg);

		yield* renderToCanvas(frame, canvas, scene, dpr);

		// scale the whole subtree to physical pixels; children keep their own
		// logical affines (parent transforms compose in the scene graph)
		if (dpr !== 1) {
			yield* Tvg.Paint.scale(scene, dpr);
		}

		yield* Tvg.Canvas.add(canvas, scene);
		yield* Tvg.Canvas.update(canvas);
		yield* Tvg.Canvas.draw(canvas);
		yield* Tvg.Canvas.sync(canvas);

		const buffer = yield* Tvg.Canvas.render(canvas);
		return {
			rgba: new Uint8Array(buffer),
			width,
			height,
			logicalWidth,
			logicalHeight,
		};
	});
