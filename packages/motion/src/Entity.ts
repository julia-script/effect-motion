import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Color from "./Color.js";
import * as Font from "./Font.js";
import * as ImageResource from "./Image.js";

/**
 * The closed entity world.
 *
 * Every entity the library knows is a member of one tagged union, declared
 * here. There is deliberately no way to define an entity outside this module:
 * an entity's complete field set is derivable from its `_tag` alone, which
 * is what lets the runner, the animators, and the renderer narrow instead
 * of casting.
 *
 * Shared fields come from mixins, never from per-entity declarations, so no
 * entity can quietly omit or rename one. An `Instance` is a REFERENCE to a
 * live entity in the runner tree — see `Instance.ts`.
 */

export const Vec3 = Schema.TaggedStruct("Vec3", {
	x: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	y: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
	z: Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(0))),
});

export type Vec3 = typeof Vec3.Type;

/** utility alias to build a Vec3 */
export const vec3 = Vec3.make;

const vec3Default = (x: number, y: number, z: number) =>
	Vec3.pipe(
		Schema.withConstructorDefault(Effect.sync(() => Vec3.make({ x, y, z }))),
	);

const defaultedNumber = (value: number) =>
	Schema.Number.pipe(Schema.withConstructorDefault(Effect.succeed(value)));

/**
 * Position and orientation. Carried by EVERY entity, the camera included:
 * a viewpoint has a location and an orientation like anything else.
 */
const transformMixin = {
	position: vec3Default(0, 0, 0),
	rotation: vec3Default(0, 0, 0),
};

/**
 * Presentation state for things that PAINT. The camera is the one entity
 * that does not (it is view state, omitted from the frame's instance map),
 * so it takes the transform mixin and none of this.
 */
const appearanceMixin = {
	scale: vec3Default(1, 1, 1),
	opacity: defaultedNumber(1),
	visible: Schema.Boolean.pipe(
		Schema.withConstructorDefault(Effect.succeed(true)),
	),
};

/** transform + appearance: the base every paintable entity shares */
const paintableMixin = {
	...transformMixin,
	...appearanceMixin,
};

const strokeMixin = {
	strokeWidth: defaultedNumber(1),
	strokeColor: Color.Color.pipe(
		Schema.withConstructorDefault(Effect.succeed(Color.black)),
	),
};

const fillMixin = {
	fillColor: Color.Color.pipe(
		Schema.withConstructorDefault(Effect.succeed(Color.white)),
	),
};

/**
 * Children are stored as instance ids, in paint order. The AUTHORING input
 * is more permissive (a string becomes a Text, an Instance contributes its
 * id, an un-yielded `instantiate` effect is resolved) — the runner
 * normalizes it here, so stored data stays plain ids.
 */
const childrenMixin = {
	children: Schema.Array(Schema.String).pipe(
		Schema.withConstructorDefault(Effect.sync(() => [])),
	),
};

/**
 * A path command point, relative to the Path's own `position` — the same
 * relative rule Line's endpoints follow, so translating a Path is rigid
 * without rewriting the command array.
 */
const point = {
	x: Schema.Number,
	y: Schema.Number,
	z: Schema.optionalKey(Schema.Number),
};

export const PathCommand = Schema.TaggedUnion({
	M: point,
	L: point,
	Z: {},
});

export type PathCommand = typeof PathCommand.Type;

// ── the entities ─────────────────────────────────────────────────────────

/**
 * A segment. `start`/`end` are offsets from `position`, so moving the line
 * translates it rigidly — no endpoint compensation anywhere in the system.
 * Skeletal: parametrized by its endpoints, never by an anchor plus size.
 */
export const Line = Schema.TaggedStruct("Line", {
	...paintableMixin,
	...strokeMixin,
	start: vec3Default(0, 0, 0),
	end: vec3Default(0, 0, 0),
});

/**
 * A polyline/polygon. Command points are relative to `position` (see
 * `point`). The first command must be `M` — an open vocabulary of M/L/Z;
 * curves and arcs arrive later via deterministic flattening.
 */
export const Path = Schema.TaggedStruct("Path", {
	...paintableMixin,
	...fillMixin,
	...strokeMixin,
	commands: Schema.NonEmptyArray(PathCommand).check(
		Schema.makeFilter((commands) =>
			commands[0]._tag === "M"
				? undefined
				: { path: [0], issue: "the first path command must be M" },
		),
	),
});

/**
 * The canonical 2.5D plane. All-zero rotation is a camera-facing billboard;
 * non-zero tilts it as a real plane in 3D.
 */
export const Rect = Schema.TaggedStruct("Rect", {
	...paintableMixin,
	...fillMixin,
	...strokeMixin,
	width: defaultedNumber(100),
	height: defaultedNumber(100),
});

export const Circle = Schema.TaggedStruct("Circle", {
	...paintableMixin,
	...fillMixin,
	...strokeMixin,
	radius: defaultedNumber(10),
});

export const Ellipse = Schema.TaggedStruct("Ellipse", {
	...paintableMixin,
	...fillMixin,
	...strokeMixin,
	radiusX: defaultedNumber(20),
	radiusY: defaultedNumber(10),
});

/**
 * A plain-string text leaf. The engine cannot measure text, so `text` has
 * no dimensional fields — layout is the renderer's business. Inline
 * formatting is expressed by composing several Texts, not by a rich tree.
 */
export const Text = Schema.TaggedStruct("Text", {
	...paintableMixin,
	...fillMixin,
	text: Schema.String,
	// numeric, therefore tweenable
	fontSize: defaultedNumber(16),
	// a Font resource reference ({_tag, id}), never a bare string. Defaults
	// to the built-in font, so bare Text stays zero-ceremony and the default
	// never enters the scene's loader requirements.
	fontFamily: Font.schema.pipe(
		Schema.withConstructorDefault(
			Effect.sync(() => Font.schema.make({ id: Font.defaultFont.id })),
		),
	),
	textAnchor: Schema.optionalKey(Schema.Literals(["start", "middle", "end"])),
	baseline: Schema.optionalKey(Schema.Literals(["auto", "middle", "hanging"])),
});

/**
 * A container: positions and structures its children, paints nothing
 * itself. Its transform composes down the subtree like any entity's.
 *
 * It carries no composition bounds. `width`/`height`/`backgroundColor` used
 * to live here so `Scene.play` could copy a nested scene's dimensions onto
 * the mount group; a Scene owns those itself, and a render-to-texture
 * boundary is `Scene.play`'s business, not a field on every group.
 */
export const Group = Schema.TaggedStruct("Group", {
	...paintableMixin,
	...childrenMixin,
});

/**
 * A screen-space container: its subtree is projected through the identity
 * camera rather than the active one, so HUD content ignores camera
 * movement, zoom, shake, and depth of field, and always paints on top.
 *
 * `position.z` is depth WITHIN the HUD tier — z consistently means depth in
 * the entity's own coordinate space, world for world content and screen for
 * HUD content. A Hud must be a top-level child of the root (or of another
 * Hud); nesting one inside world content is a loud defect.
 */
export const Hud = Schema.TaggedStruct("Hud", {
	...paintableMixin,
	...childrenMixin,
});

/**
 * A raster/vector image leaf. `image` is an Image resource reference; the
 * bytes live in the scene's requirements, never in frame data.
 *
 * `width`/`height` are optional and undefaulted: set BOTH to draw at that
 * size (numeric, so they tween), leave both absent for the source's natural
 * size. A lone dimension is ignored — aspect math needs the natural size,
 * which frame data never sees.
 */
export const Image = Schema.TaggedStruct("Image", {
	...paintableMixin,
	image: ImageResource.schema,
	width: Schema.optionalKey(Schema.Number),
	height: Schema.optionalKey(Schema.Number),
});

/**
 * The viewpoint. The ONE non-paintable entity: it is view state, omitted
 * from the frame's instance map, and never renders. It therefore carries
 * position and rotation but no scale, opacity, or visibility.
 *
 * `z`, `focalLength`, and `focusDistance` are width-relative and filled by
 * the Runner at instantiate — only it knows the comp width. The zero
 * defaults here are placeholders that the Runner always overwrites.
 */
export const Camera = Schema.TaggedStruct("Camera", {
	...transformMixin,
	focalLength: defaultedNumber(0),
	focusDistance: defaultedNumber(0),
	aperture: defaultedNumber(0),
	poi: Vec3.pipe(
		Schema.NullOr,
		Schema.withConstructorDefault(Effect.succeed(null)),
	),
});

// ── the union ────────────────────────────────────────────────────────────

export const EntityMap = {
	Line,
	Path,
	Rect,
	Circle,
	Ellipse,
	Text,
	Group,
	Hud,
	Image,
	Camera,
} as const;

/** decoded entity data — the union every consumer narrows on */
export type Entity = (typeof EntityMap)[keyof typeof EntityMap]["Type"];

/** every entity's tag: the discriminant, and the entity's identity */
export type EntityTag = Entity["_tag"];

/** the data type of one entity, by tag */
export type EntityByTag<Tag extends EntityTag> = Extract<Entity, { _tag: Tag }>;

/** the definition (schema) of one entity, by tag */
type EntityDefinitionByTag<Tag extends EntityTag> = (typeof EntityMap)[Tag];

export const getEntityDefinitionByTag = <Tag extends EntityTag>(
	tag: Tag,
): EntityDefinitionByTag<Tag> => EntityMap[tag];

/**
 * The constructor input for one entity: what `make` accepts, with defaulted
 * fields optional. This is the authoring surface — `instantiate` widens
 * `children` on top of it (see Runner.InstantiateProps).
 */
export type MakeInput<Tag extends EntityTag> =
	EntityDefinitionByTag<Tag>["~type.make.in"];

/**
 * Tags whose entity carries a given field — how animators state their
 * requirements now that traits are gone. `TagsWith<"opacity">` is every
 * paintable entity; `fade` constrains on it, so fading a Camera is a
 * compile error naming the missing field rather than a runtime defect.
 */
export type TagsWith<Field extends string> = Extract<
	Entity,
	Record<Field, unknown>
>["_tag"];

/** the entities that hold children: containers */
export type ContainerTag = TagsWith<"children">;

/** entity data narrowed to a container */
type ContainerEntity = Extract<Entity, { children: ReadonlyArray<string> }>;

/**
 * Every container tag, exhaustively. `Record<ContainerTag, true>` (not
 * `satisfies Array<ContainerTag>`) is deliberate: an array only checks its
 * members are valid tags, so a newly-added container would silently miss
 * this set. A Record demands every key, so omitting one fails the build.
 */
const containerTags: Record<ContainerTag, true> = {
	Group: true,
	Hud: true,
};

/**
 * Whether an entity can hold children. Previously this was "does its data
 * have a `children` field", answerable only at runtime because entity shapes
 * were unknowable; now it is a property of the tag.
 */
export const isContainer = (entity: Entity): entity is ContainerEntity =>
	entity._tag in containerTags;
