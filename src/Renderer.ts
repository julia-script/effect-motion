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
				config: Config
				
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
				config: Config
			) => Effect.Effect<RenderSuccess, never, Renderers<Entities>>;
		}>(tag);

		const service = context.of({
			render: Effect.fnUntraced(function* (
				frame,
				customConfig
			) {
				const entries = Object.entries(frame.instances).map(([id, entry]) =>
					Effect.gen(function* () {
						const entityRenderer = yield* getEntityRenderer(entry.entity);
						return {
							id,
							render: entityRenderer.render({ id, ...entry }),
							entry,
						};
					}),
				);
				const rendered = yield* Effect.all(entries);
				return yield* config.render(rendered, customConfig);
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
