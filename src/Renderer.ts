import { Layer } from "effect";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import type * as Entity from "./Entity";
import type { EntriesFromEntities, Frame } from "./Scene";

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
	 * rendered output of this instance's children, post-order (empty for
	 * leaves). In frame data, a `children: string[]` field means child
	 * instance ids — containers embed these results in their own output.
	 */
	children: ReadonlyArray<Success>;
}) => Effect.Effect<Success, E, R>;

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
				}>,
				config: Config,
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

		const service = context.of({
			render: Effect.fnUntraced(function* <
				const Entities extends Entity.AnyEntity,
			>(frame: Frame<Entities>, customConfig: Config) {
				interface TreeEntry {
					readonly id: string;
					readonly render: Effect.Effect<RenderEntitySuccess>;
					readonly entry: EntriesFromEntities<Entities>;
				}
				const visited = new Set<string>();

				// post-order: children build (and later render) before their
				// container, which receives the rendered results
				const buildEntry = (id: string): Effect.Effect<TreeEntry> =>
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
						const childEntries = yield* Effect.all(
							childIdsOf(entry.data).map(buildEntry),
						);
						const entityRenderer = yield* getEntityRenderer(entry.entity);
						return {
							id,
							render: Effect.gen(function* () {
								const children = yield* Effect.all(
									childEntries.map((child) => child.render),
								);
								return yield* entityRenderer.render({
									id,
									children,
									...entry,
								});
							}),
							entry,
						};
					}) as Effect.Effect<TreeEntry>;

				const rootEntry = frame.instances[frame.root];
				if (rootEntry === undefined) {
					return yield* Effect.die(
						new Error(`Renderer: missing root instance "${frame.root}"`),
					);
				}
				visited.add(frame.root);
				// the root group never renders; its children are the top level
				const entries = yield* Effect.all(
					childIdsOf(rootEntry.data).map(buildEntry),
				);
				return yield* config.render(entries, customConfig);
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
