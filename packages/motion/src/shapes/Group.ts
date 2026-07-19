import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaGetter from "effect/SchemaGetter";
import * as Color from "../Color.js";
import * as Entity from "../Entity.js";
import * as Shape2D from "./Shape2D.js";

export const TransformMatrix = Schema.Struct({
	a: Schema.Number,
	b: Schema.Number,
	c: Schema.Number,
	d: Schema.Number,
	e: Schema.Number,
	f: Schema.Number,
});

export type TransformMatrix = typeof TransformMatrix.Type;

export const identityTransform = {
	a: 1,
	b: 0,
	c: 0,
	d: 1,
	e: 0,
	f: 0,
} satisfies TransformMatrix;

export const multiplyTransforms = (
	left: TransformMatrix,
	right: TransformMatrix,
): TransformMatrix => ({
	a: left.a * right.a + left.c * right.b,
	b: left.b * right.a + left.d * right.b,
	c: left.a * right.c + left.c * right.d,
	d: left.b * right.c + left.d * right.d,
	e: left.a * right.e + left.c * right.f + left.e,
	f: left.b * right.e + left.d * right.f + left.f,
});

export const TransformOperation = Schema.TaggedUnion({
	"transform/translate": { x: Schema.Number, y: Schema.Number },
	"transform/scale": { x: Schema.Number, y: Schema.Number },
	"transform/matrix": TransformMatrix.fields,
});

const TransformOperations = Schema.Array(TransformOperation);

const operationMatrix = (
	operation: typeof TransformOperation.Type,
): TransformMatrix =>
	TransformOperation.match(operation, {
		"transform/translate": ({ x, y }) => ({
			...identityTransform,
			e: x,
			f: y,
		}),
		"transform/scale": ({ x, y }) => ({
			...identityTransform,
			a: x,
			d: y,
		}),
		"transform/matrix": ({ a, b, c, d, e, f }) => ({ a, b, c, d, e, f }),
	});

export const Transform = TransformOperations.pipe(
	Schema.decodeTo(TransformMatrix, {
		// Post-multiplication preserves the authored transform-list order.
		decode: SchemaGetter.transform((operations) =>
			operations.reduce(
				(matrix, operation) =>
					multiplyTransforms(matrix, operationMatrix(operation)),
				identityTransform,
			),
		),
		encode: SchemaGetter.transform((matrix) => [
			{ _tag: "transform/matrix" as const, ...matrix },
		]),
	}),
);

const fields = {
	...Shape2D.position,
	...Shape2D.opacity,
	transform: TransformMatrix.pipe(
		Schema.withConstructorDefault(Effect.succeed(identityTransform)),
	),
	// comp bounds (Scene.play mount groups carry the child comp's): a SIZED
	// group clips its subtree to them, paints a non-transparent
	// backgroundColor within them, and renders as one unit (AE precomp)
	width: Schema.optionalKey(Schema.Number),
	height: Schema.optionalKey(Schema.Number),
	backgroundColor: Schema.optionalKey(Color.Color),
	children: Schema.Array(Schema.String).pipe(
		Schema.withConstructorDefault(Effect.sync(() => [])),
	),
};

type StoredInput = Schema.Struct<typeof fields>["~type.make.in"];
type GroupData = Schema.Struct<typeof fields>["Type"];
type GroupInput = Omit<StoredInput, "transform"> & {
	readonly transform?: typeof TransformOperations.Type;
};

const decodeTransform = Schema.decodeUnknownSync(Transform);

const _normalizeInput = (input: GroupInput | StoredInput): StoredInput =>
	Array.isArray(input.transform)
		? { ...input, transform: decodeTransform(input.transform) }
		: (input as StoredInput);

// A container: positions and structures its children, paints nothing.
// Transform operations are normalized once to a target-independent affine
// matrix; render targets never interpret the operation list.
const traits = {
	// moving a group moves the subtree (children keep local coordinates)
	"~position": Shape2D.positionLens<GroupData>(),
	"~opacity": Shape2D.opacityLens<GroupData>(),
};

export const Group = Entity.make<"shapes/Group", typeof fields, typeof traits>(
	"shapes/Group",
	fields,
	traits,
);

/** The group's x/y position composed outside its normalized local transform. */
export const resolvedTransform = (data: {
	readonly x: number;
	readonly y: number;
	readonly transform: TransformMatrix;
}): TransformMatrix =>
	multiplyTransforms(
		{ ...identityTransform, e: data.x, f: data.y },
		data.transform,
	);

export const isIdentityTransform = (matrix: TransformMatrix): boolean =>
	matrix.a === 1 &&
	matrix.b === 0 &&
	matrix.c === 0 &&
	matrix.d === 1 &&
	matrix.e === 0 &&
	matrix.f === 0;
