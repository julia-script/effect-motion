import type {
	OwnedPaint,
	ThorvgException,
	ThorvgWasm,
} from "@effect-motion/thorvg";
import * as Tvg from "@effect-motion/thorvg";
import type { Canvas } from "@effect-motion/thorvg/Canvas";
import * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";
import type * as Entity from "./Entity";
import * as Projection from "./Projection";
import { parseColor } from "./render/color";
import { builtinPaints } from "./render/shapes";
import type { EntriesFromEntities, Frame } from "./Scene";

/**
 * The projection handed to each paint function — how the camera places a
 * paintable this frame. `screen` is the projected billboard placement (an
 * affine the paint fn applies via `setTransform`); `depth` is the view-space
 * sort key; `scale` is the perspective scale (<= 0 means the anchor is behind
 * the camera — cull, unless a `quad` is present). `quad`, when present, is
 * the projected, near-plane-clipped screen polygon of a tilted plane (3–5
 * vertices — see Projection.projectPlane); a shape that can tilt paints an
 * exact path from these instead of applying the billboard affine.
 */
export interface PaintProjection {
	readonly screen: Projection.Affine;
	readonly depth: number;
	readonly scale: number;
	readonly quad?: ReadonlyArray<Projection.Vec2>;
}

/** The frame's render metadata, handed to paint functions. */
export interface FrameMeta {
	readonly frameRate: number;
	readonly width: number;
	readonly height: number;
	readonly backgroundColor: string;
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
}) => Effect.Effect<void, ThorvgException, ThorvgWasm | Scope.Scope>;

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
): Effect.Effect<void, ThorvgException, ThorvgWasm | Scope.Scope> =>
	Effect.gen(function* () {
		interface Paintable {
			readonly id: string;
			readonly entry: EntriesFromEntities<Entities>;
			readonly projection: PaintProjection;
		}
		const camera = frame.camera;
		const origin: Projection.Vec2 = {
			x: frame.width / 2,
			y: frame.height / 2,
		};
		const visited = new Set<string>();
		const paintables: Paintable[] = [];

		// Flatten the tree to a draw list. A container (a node with a
		// `children` field) is NOT a paint-order boundary: its position
		// composes into its children's world coordinates, and each child is
		// emitted into the same flat list. `offset` is the accumulated world
		// translation from ancestor containers.
		const flatten = (
			id: string,
			offset: Projection.Vec3,
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
				const data = entry.data as Partial<Projection.Vec3> & {
					children?: unknown;
					width?: number;
					height?: number;
					rotX?: number;
					rotY?: number;
					rotZ?: number;
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
					// nothing itself (the root and Groups). ponytail: only
					// translation composes down — a Group's 2D affine transform
					// is not yet threaded into child world coords.
					yield* Effect.all(childIds.map((childId) => flatten(childId, world)));
					return;
				}
				// a leaf paintable: project its world anchor for placement +
				// depth, but anchor the billboard affine on the shape's own
				// LOCAL coordinates — the shape paints at local (data.x/y), so
				// the transform maps local → screen. The composed ancestor
				// offset lives in the transform's translation.
				const proj = Projection.project(camera, world, origin);
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
							camera,
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
				.map((childId) => flatten(childId, { x: 0, y: 0, z: 0 })),
		);

		// painter's order: farthest first. Stable sort, id tie-break, so
		// equal-depth paintables paint in a deterministic order across runs.
		// ponytail: naive O(n log n) per frame — swap for a spatial structure
		// only if a scene with thousands of objects proves it.
		paintables.sort(
			(a, b) =>
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

		// paint far→near. A paintable whose anchor is behind the camera
		// (scale <= 0) is culled here so paint functions never see an invalid
		// placement — EXCEPT a tilted plane carrying a quad: its polygon is
		// already near-plane-clipped, and it can be visible (near part in
		// front) while its anchor corner is behind.
		for (const { id, entry, projection } of paintables) {
			if (projection.scale <= 0 && projection.quad === undefined) {
				continue;
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
				scene,
				meta,
			});
		}
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
		const { r, g, b, a } = parseColor(frame.backgroundColor);
		yield* Tvg.Shape.setFillColor(bg, r, g, b, a);
		yield* Tvg.Scene.add(scene, bg);

		yield* renderToCanvas(frame, canvas, scene);

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
