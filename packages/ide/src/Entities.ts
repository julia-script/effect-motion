/**
 * The entity catalog — the tags `Scene.instantiate` accepts.
 *
 * @remarks
 * `instantiate` takes a STRING tag, so TypeScript already completes the
 * name; what it cannot show at the call site is what the shape is for and
 * which fields distinguish it from its neighbours. That is what this table
 * carries.
 *
 * The entity world is closed by design, and `test/entities.test.ts` asserts
 * this table covers `Entity.EntityMap` exactly — a new shape in the core
 * fails the test rather than quietly missing its completions.
 */

export interface EntityInfo {
	readonly tag: string;
	/** One line: what it draws. */
	readonly summary: string;
	/** The fields that are this entity's own, beyond the shared ones. */
	readonly fields: ReadonlyArray<string>;
	/** Can it hold children? */
	readonly container: boolean;
	/** Does it paint (i.e. carry opacity, scale, fill)? */
	readonly paintable: boolean;
}

/** Fields every entity carries. */
export const TRANSFORM_FIELDS = ["position", "rotation"] as const;

/** Fields every painting entity carries on top of the transform. */
export const APPEARANCE_FIELDS = ["scale", "opacity", "visible"] as const;

export const entities: ReadonlyArray<EntityInfo> = [
	{
		tag: "Circle",
		summary: "A filled circle centred on its position.",
		fields: ["radius", "fillColor", "strokeColor", "strokeWidth"],
		container: false,
		paintable: true,
	},
	{
		tag: "Ellipse",
		summary: "A circle with independent horizontal and vertical radii.",
		fields: ["radiusX", "radiusY", "fillColor", "strokeColor", "strokeWidth"],
		container: false,
		paintable: true,
	},
	{
		tag: "Rect",
		summary:
			"The canonical 2.5D plane — a camera-facing billboard at zero rotation, a real plane in 3D when tilted.",
		fields: ["width", "height", "fillColor", "strokeColor", "strokeWidth"],
		container: false,
		paintable: true,
	},
	{
		tag: "Line",
		summary:
			"A segment between two endpoints, both relative to the entity's position.",
		fields: ["start", "end", "strokeColor", "strokeWidth"],
		container: false,
		paintable: true,
	},
	{
		tag: "Path",
		summary:
			"A polyline or polygon from M/L/Z commands, each point relative to the position. The first command must be M.",
		fields: ["commands", "fillColor", "strokeColor", "strokeWidth"],
		container: false,
		paintable: true,
	},
	{
		tag: "Text",
		summary:
			"A plain-string leaf. The engine cannot measure text, so there are no width or height fields — compose several Texts for inline styling.",
		fields: [
			"text",
			"fontSize",
			"fontFamily",
			"textAnchor",
			"baseline",
			"fillColor",
		],
		container: false,
		paintable: true,
	},
	{
		tag: "Image",
		summary:
			"A raster or vector image leaf. Set BOTH width and height to force a size, or neither for the source's natural size.",
		fields: ["image", "width", "height"],
		container: false,
		paintable: true,
	},
	{
		tag: "Group",
		summary:
			"A container that paints nothing itself; its transform composes down the whole subtree.",
		fields: ["children"],
		container: true,
		paintable: true,
	},
	{
		tag: "Hud",
		summary:
			"A screen-space container: its subtree ignores the active camera and always paints on top. Must be a top-level child of the root (or of another Hud).",
		fields: ["children"],
		container: true,
		paintable: true,
	},
	{
		tag: "Camera",
		summary:
			"View state, not a painted entity: focal length, focus distance, aperture, and an optional point of interest.",
		fields: ["focalLength", "focusDistance", "aperture", "poi"],
		container: false,
		paintable: false,
	},
];

/** Catalog entries by tag. */
export const byTag: ReadonlyMap<string, EntityInfo> = new Map(
	entities.map((entity) => [entity.tag, entity]),
);

/** Is `tag` an entity the engine knows? */
export const isEntityTag = (tag: string): boolean => byTag.has(tag);

/** The catalog entry for a tag, or `undefined` for anything else. */
export const find = (tag: string): EntityInfo | undefined => byTag.get(tag);
