import { Layer } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Entity from "./Entity";
import * as Projection from "./Projection";
import type { EntriesFromEntities, Frame } from "./Scene";

/**
 * The projection handed to each paintable — how the camera places it this
 * frame. `screen` is the projected billboard placement (an affine the sink
 * wraps around the shape's local/world geometry); `depth` is the view-space
 * sort key. `quad`, when present, is the four projected screen corners of a
 * tilted plane (see Projection.projectQuad) — a shape that can tilt uses
 * these to emit an exact polygon instead of the billboard affine.
 */
export interface PaintProjection {
	readonly screen: Projection.Affine;
	readonly depth: number;
	readonly scale: number;
	readonly quad?: readonly [
		Projection.Vec2,
		Projection.Vec2,
		Projection.Vec2,
		Projection.Vec2,
	];
}

/** Renders one entity instance to the renderer's per-entity output. */
export type RenderFunction<
	Success,
	Ent extends Entity.AnyEntity,
	E = never,
	R = never,
> = (payload: {
	entity: Ent;
	id: string;
	data: Ent["data"]["Type"];
	/**
	 * rendered output of this instance's children (empty for leaves). In
	 * frame data, a `children: string[]` field means child instance ids —
	 * containers embed these results in their own output. Containers no
	 * longer establish a paint-order boundary: children are flattened into
	 * the global depth sort, so this is empty for most shapes and used only
	 * by containers that still wrap their subtree structurally.
	 */
	children: ReadonlyArray<Success>;
}) => Effect.Effect<Success, E, R>;

/** the frame's render metadata, handed to sink render functions */
export interface FrameMeta {
	readonly frameRate: number;
	readonly width: number;
	readonly height: number;
	readonly backgroundColor: string;
	/**
	 * the active camera's view — world position `{x, y, z}`, Euler
	 * orientation `{rotX, rotY, rotZ}`, and `focalLength` (FOV). Sinks
	 * project every instance through it. The resting camera (see
	 * Camera.IDENTITY) reproduces plain-2D placement for z=0 content.
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

export interface EntityRenderer<
	Name extends string,
	Success,
	Ent extends Entity.AnyEntity,
	E,
	R,
> {
	readonly name: Name;
	readonly render: RenderFunction<Success, Ent, E, R>;
}

type RendererName<
	Tag extends string,
	Ent extends Entity.AnyEntity,
> = `${Tag}/${Ent["name"]}`;

/**
 * Build a renderer family.
 *
 * `make<EntityOutput>()(tag, { render })` creates a frame renderer that
 * resolves one `EntityRenderer` per entity type from context (keyed
 * `<tag>/<entity name>`) and combines the per-entity outputs with
 * `config.render`. Provide per-entity renderers with
 * `makeEntityRendererLayer` and the frame renderer with `layer`.
 */
export const make =
	<RenderEntitySuccess, Config = void>() =>
	<const Tag extends string, RenderSuccess>(
		tag: Tag,
		config: {
			render: <Entities>(
				entities: Iterable<{
					id: string;
					render: Effect.Effect<RenderEntitySuccess>;
					entry: EntriesFromEntities<Entities>;
					/** how the camera places this paintable this frame */
					projection: PaintProjection;
				}>,
				config: Config,
				meta: FrameMeta,
			) => Effect.Effect<RenderSuccess>;
		},
	) => {
		type Renderers<Entities extends Entity.AnyEntity> =
			Entities extends Entity.AnyEntity
				? {
						[K in Entities as K["name"]]: EntityRenderer<
							RendererName<Tag, K>,
							RenderEntitySuccess,
							K,
							never,
							never
						>;
					}[Entities["name"]]
				: never;

		const makeEntityRendererContext = <
			const Ent extends Entity.AnyEntity,
			E = never,
			R = never,
		>(
			entity: Ent,
		) =>
			Context.Service<
				EntityRenderer<RendererName<Tag, Ent>, RenderEntitySuccess, Ent, E, R>
			>(`${tag}/${entity.name}`);

		const makeEntityRendererService = <
			const Ent extends Entity.AnyEntity,
			E = never,
			R = never,
		>(
			entity: Ent,
			render: RenderFunction<RenderEntitySuccess, Ent, E, R>,
		) =>
			makeEntityRendererContext<Ent, E, R>(entity).of({
				name: `${tag}/${entity.name}`,
				render,
			});

		const makeEntityRendererLayer = <
			const Ent extends Entity.AnyEntity,
			E = never,
			R = never,
		>(
			entity: Ent,
			render: RenderFunction<RenderEntitySuccess, Ent, E, R>,
		): Layer.Layer<
			EntityRenderer<RendererName<Tag, Ent>, RenderEntitySuccess, Ent, E, R>
		> =>
			Layer.succeed(
				makeEntityRendererContext<Ent, E, R>(entity),
				makeEntityRendererService(entity, render),
			);

		// The concrete member of Renderers<Entities> is only known at
		// runtime (it depends on the instance's entity), hence the cast.
		const getEntityRenderer = <Entities extends Entity.AnyEntity>(
			entity: Entities,
		) =>
			Effect.gen(function* () {
				return yield* makeEntityRendererContext(entity);
			}) as Effect.Effect<Renderers<Entities>>;

		const context = Context.Service<{
			render: <const Entities extends Entity.AnyEntity>(
				frame: Frame<Entities>,
				config: Config,
			) => Effect.Effect<RenderSuccess, never, Renderers<Entities>>;
		}>(tag);

		// in frame data, a `children: string[]` field means child instance ids
		const childIdsOf = (data: unknown): ReadonlyArray<string> => {
			const children = (data as { children?: unknown } | null)?.children;
			return Array.isArray(children) ? children : [];
		};

		// a hidden instance ($visible false) and its subtree are skipped
		// entirely — target-agnostic, so every sink honors visibility for free
		const isVisible = <Entities extends Entity.AnyEntity>(
			frame: Frame<Entities>,
			id: string,
		): boolean => frame.instances[id]?.$visible !== false;

		const service = context.of({
			render: Effect.fnUntraced(function* <
				const Entities extends Entity.AnyEntity,
			>(frame: Frame<Entities>, customConfig: Config) {
				interface Paintable {
					readonly id: string;
					readonly render: Effect.Effect<RenderEntitySuccess>;
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
				// composes into its children's world coordinates, and each
				// child is emitted into the same flat list. `offset` is the
				// accumulated world translation from ancestor containers.
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
							// translation composes down — a Group's 2D affine
							// transform is not yet threaded into child world coords.
							yield* Effect.all(
								childIds.map((childId) => flatten(childId, world)),
							);
							return;
						}
						// a leaf paintable: project its world anchor for placement +
						// depth, but anchor the billboard affine on the shape's own
						// LOCAL coordinates — the shape renders at local (data.x/y),
						// so the transform must map local → screen. The composed
						// ancestor offset lives in the transform's translation.
						const proj = Projection.project(camera, world, origin);
						const entityRenderer = yield* getEntityRenderer(entry.entity);
						// A rectangular plane with any nonzero rotation tilts: project
						// its four corners so a sink can emit an exact polygon. The
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
							? Projection.projectQuad(
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
							render: entityRenderer.render({ id, children: [], ...entry }),
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
				// equal-depth paintables paint in a deterministic order across
				// runs and across sinks.
				// ponytail: naive O(n log n) per frame — swap for a spatial
				// structure only if a scene with thousands of objects proves it.
				paintables.sort(
					(a, b) =>
						b.projection.depth - a.projection.depth ||
						(a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
				);

				return yield* config.render(paintables, customConfig, {
					frameRate: frame.frameRate,
					width: frame.width,
					height: frame.height,
					backgroundColor: frame.backgroundColor,
					camera: frame.camera,
				});
			}),
		});

		return {
			Context: context,
			layer: Layer.succeed(context, service),
			makeEntityRendererContext,
			makeEntityRendererService,
			makeEntityRendererLayer,
		};
	};
