import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { describe, expect, it } from "vitest";
import * as Font from "../src/Font.js";
import * as Image from "../src/Image.js";
import * as Resource from "../src/Resource.js";
import type { Runner } from "../src/Runner.js";
import { unreachable } from "./support/raise.js";

// -- type-level assertions ---------------------------------------------------

type Equal<A, B> =
	(<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
		? true
		: false;
type Assert<T extends true> = T;

type FontsAndRunner =
	| Font.FontLoader<"Roboto">
	| Image.ImageLoader<"logo">
	| Runner;

// ExtractLoaders keeps exactly the branded members; ExcludeLoaders removes
// exactly those — non-loader services pass through unchanged
type _extract = Assert<
	Equal<
		Resource.ExtractLoaders<FontsAndRunner>,
		Font.FontLoader<"Roboto"> | Image.ImageLoader<"logo">
	>
>;
type _exclude = Assert<Equal<Resource.ExcludeLoaders<FontsAndRunner>, Runner>>;
type _extractEmpty = Assert<Equal<Resource.ExtractLoaders<Runner>, never>>;
type _excludeAll = Assert<
	Equal<Resource.ExcludeLoaders<Font.FontLoader<"Roboto">>, never>
>;

// yielding a font declares the loader requirement and succeeds with the value
const authored = Effect.gen(function* () {
	return yield* Font.Font("Roboto");
});
type _authoredR = Assert<
	Equal<
		typeof authored extends Effect.Effect<infer _A, infer _E, infer R>
			? R
			: never,
		Font.FontLoader<"Roboto">
	>
>;

// non-literal ids are rejected at the type level (never invoked — the
// declare binding has no runtime value)
const _nonLiteralRejected = (someString: string) => {
	// @ts-expect-error a plain string id would mint FontLoader<string>
	Font.Font(someString);
	// @ts-expect-error same for images
	Image.Image(someString);
};

// -- runtime -----------------------------------------------------------------

describe("resource constants", () => {
	it("yields the resource value without touching context", async () => {
		const font = await Effect.runPromise(
			// no loader provided: the requirement is phantom at authoring
			// (unknown-cast erases the phantom R to run bare)
			Font.Font("Roboto") as unknown as Effect.Effect<Font.Font<"Roboto">>,
		);
		expect(font).toEqual({ _tag: Font.tag, id: "Roboto" });
	});

	it("a tag rebuilt from the id string resolves the authored loader", async () => {
		const RobotoFont = Font.Font("Roboto");
		const service: Font.FontLoader<"Roboto"> = {
			[Resource.LoaderTypeId]: Resource.LoaderTypeId,
			id: "Roboto",
			bytes: new Uint8Array([1, 2, 3]),
		};
		const ctx = Context.make(RobotoFont.Loader, service);
		const rebuilt = Context.get(ctx, Font.Loader("Roboto"));
		expect(rebuilt).toBe(service);
	});

	it("layer runs the load once, at construction", async () => {
		let loads = 0;
		const RobotoFont = Font.Font("Roboto");
		const layer = Font.layer(
			RobotoFont,
			Effect.sync(() => {
				loads++;
				return new Uint8Array([7]);
			}),
		);
		const program = Effect.gen(function* () {
			const ctx = yield* Layer.build(layer);
			expect(loads).toBe(1);
			const first = Context.get(ctx, RobotoFont.Loader);
			const second = Context.get(ctx, Font.Loader("Roboto"));
			expect(first.bytes).toEqual(new Uint8Array([7]));
			expect(second).toBe(first);
		});
		await Effect.runPromise(Effect.scoped(program));
		expect(loads).toBe(1);
	});

	it("merged layers load every provided font, used or not", async () => {
		const loaded: string[] = [];
		const load = (id: string) =>
			Effect.sync(() => {
				loaded.push(id);
				return new Uint8Array([0]);
			});
		const layer = Layer.mergeAll(
			Font.layer(Font.Font("A"), load("A")),
			Font.layer(Font.Font("B"), load("B")),
		);
		await Effect.runPromise(
			Effect.scoped(Layer.build(layer).pipe(Effect.asVoid)),
		);
		expect(loaded.sort()).toEqual(["A", "B"]);
	});

	it("default font uses the reserved sans-serif id", () => {
		expect(Font.defaultFont.id).toBe("sans-serif");
		const value = Font.schema.make({ id: "sans-serif" });
		expect(value._tag).toBe(Font.tag);
	});

	it("image constants mirror the font contract", async () => {
		const Logo = Image.Image("logo");
		const image = await Effect.runPromise(
			Logo as unknown as Effect.Effect<Image.Image<"logo">>,
		);
		expect(image).toEqual({ _tag: Image.tag, id: "logo" });
		const layer = Image.layer(Logo, Effect.succeed(new Uint8Array([9])));
		const bytes = await Effect.runPromise(
			Effect.scoped(
				Layer.build(layer).pipe(
					Effect.map((ctx) => Context.get(ctx, Image.Loader("logo")).bytes),
				),
			),
		);
		expect(bytes).toEqual(new Uint8Array([9]));
	});
});

// keep the type-only assertions and negative cases referenced
export type _keep = [
	_extract,
	_exclude,
	_extractEmpty,
	_excludeAll,
	_authoredR,
];
export const _keepValues = [_nonLiteralRejected, unreachable];
