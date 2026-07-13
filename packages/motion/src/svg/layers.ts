import { Layer } from "effect";
import type * as Entity from "../Entity";
import type * as Renderer from "../Renderer";
import { SvgDomRenderer } from "./SvgDomRenderer";
import type { SvgNode } from "./SvgNode";
import { SvgRenderer } from "./SvgRenderer";

/**
 * Register one SvgNode render function for an entity with BOTH sinks.
 *
 * Entity renderer context keys are per renderer family
 * (`SvgRenderer/<name>` and `SvgDomRenderer/<name>`), so sharing a render
 * function across sinks means registering it twice — this does both.
 */
export const entityRendererLayer = <const Ent extends Entity.AnyEntity>(
	entity: Ent,
	render: Renderer.RenderFunction<SvgNode, Ent>,
) =>
	Layer.mergeAll(
		SvgRenderer.makeEntityRendererLayer(entity, render),
		SvgDomRenderer.makeEntityRendererLayer(entity, render),
	);

/** Both sinks' frame renderers, ready to provide. */
export const layer = Layer.mergeAll(SvgRenderer.layer, SvgDomRenderer.layer);
