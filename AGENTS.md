# effect-motion — API conventions

Conventions for agents and contributors working on this codebase. The
library animates schema-backed entities in deterministic, frame-exact
scenes built on Effect. These rules hold everywhere; PRs that break them
need a design reason recorded in an openspec change.

## The base/To pair pattern

Every animator comes as a pair distinguished **only** by where the
origin comes from:

- `verb(instance, from, to, ...)` — **explicit origin**. Partial origins
  are filled from the current value.
- `verbTo(instance, to, ...)` — **origin read from the instance** (via
  its data or trait lens).

This holds across both engines: `tween`/`tweenTo` and `move`/`moveTo`,
`fade`/`fadeTo` (duration + easing) as well as `spring`/`springTo`
(physics, no duration — length emerges from the simulation). When adding
a new animator, ship the pair, never a lone form.

**Exception — target-naming verbs** (recorded in the camera-poi-helpers
change): an animator whose verb phrase already names its target
(`Camera.lookAt`, `Camera.follow`) has no base/To pair — the base variant
("ease your gaze from a place you aren't looking") is useless, and the To
suffix double-stacks prepositions. An optional duration selects instant
vs eased instead. Value-animating helpers (`Camera.orbit`/`orbitTo`,
`Camera.dolly`/`dollyTo`) keep the full pair — they animate a field-like
value exactly as `moveTo` does.

## The two layers

| layer | functions | operates on | value types |
|---|---|---|---|
| **raw** | `Motion.tween` / `tweenTo` | numeric fields by name | `Target<Data>` (inferred from the schema) |
| **semantic** | `Motion.move`/`moveTo`, `Motion.fade`/`fadeTo`, `Physics.spring`/`springTo` | trait lenses | concrete (`{x?, y?}`, `number`) |

Rule of thumb: **prefer the semantic helper when one exists** — it
carries per-entity meaning (moving a Line translates both endpoints;
moving a Group carries its subtree). Use `tween`/`tweenTo` for fields
without a trait (`radius`, `width`, custom entity fields). Springy
effects on raw fields use elastic/bounce *easings*, not physics.

## Trait lenses (all-or-nothing)

A trait is a complete get/set lens declared on the entity:

```ts
Entity.make("shapes/Thing", fields, {
  "~position": {
    get: (data) => ({ x: data.x, y: data.y }),
    set: (data, value) => ({ ...data, x: value.x, y: value.y }),
  },
})
```

- `get` and `set` live in **one object per trait key** — a lone getter
  or setter is unrepresentable by design. Entities may omit a trait
  entirely, never half of one.
- `set` receives the whole data and returns a **new immutable whole**;
  each entity owns its semantics.
- Current keys: `~position` (`{x, y}`), `~opacity` (number). Standard
  x/y implementations come from `Shape2D.positionLens()` /
  `Shape2D.opacityLens()`; write a custom lens only when semantics
  differ (see `shapes/Line.ts`).
- Detection is type-level (helpers constrain on the instance's traits;
  calling `moveTo` on an untraited entity fails compilation) with a
  runtime defect naming the entity and trait key as backstop.

## Two-tier 3D positioning (planar vs skeletal)

Shapes occupy 3D space in one of two ways — never both on one shape:

- **Planar** (Rect, Image, Text — content on a flat extent): anchor
  `x/y/z` plus Euler orientation `rotX/rotY/rotZ`; the renderer projects
  the plane's corners (the AE layer model).
- **Skeletal** (Line; Path when it goes 3D): every defining point is an
  independent world point (`x/y/z`, `x2/y2/z2`), each projected with its
  own depth. Skeletal shapes never get orientation fields — a segment is
  parametrized by its endpoints, and tweening a point moves it in a
  straight line (deriving an orientation instead would make tweens sweep
  arcs).
- The trait layer hides the split: `~position` moves ANY entity rigidly
  as one unit. Only raw field vocabulary differs per tier.

## Call forms

Every animator is a dual: data-first `verb(instance, ...)` or pipeable
`instance.pipe(verb(...))`. Dispatch is by `Instance.isInstance` on the
first argument (never arity — trailing optional params make arity
ambiguous). Animators resolve with the instance, so they chain.

## One module per "actor"

Effect code is organized by *actor*, not by kind-of-thing. An actor is not
a class — it is a module whose name is the thing (`Motion.ts`, `Scene.ts`,
`Instance.ts`, `Runner.ts`), containing:

- the **data/service** itself, usually named after the module
  (`Scene.Scene`, `Instance.Instance`), and
- **helper functions that take that thing as a parameter**
  (`Scene.instantiate`, `Instance.isInstance`, `Motion.tween`).

**The main export is mostly data.** `Redis.Redis`, `Option.Option`,
`Queue.Queue` have very few methods, often none. A service carries some
getters/setters; a data type carries none. The core logic lives in
*sibling functions in the same file that take the thing as their first
parameter* — that is what keeps it composable and tree-shakeable.

```ts
import * as Option from "effect/Option";

type MainType = Option.Option<number>; // pure data
Option.some; // factory
Option.none; // factory
Option.getOrElse; // operations live outside the value
Option.andThen;
```

```ts
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";

const queue = yield * Queue.make<number>();
queue.capacity; // a few getters — still mostly data
queue.state;

yield * Queue.offer(queue, 1); // the real API is external
yield * Queue.take(queue);

// and where it makes sense, those functions are `dual` (effect/Function),
// so both call forms work:
Stream.take(stream, 2).pipe(Stream.runCollect);
stream.pipe(Stream.take(2), Stream.runCollect);
```

This is the same shape Effect itself uses:

```ts
import * as Redis from "effect/unstable/persistence/Redis";
import * as Activity from "effect/unstable/workflow/Activity";

Redis.Redis      // the service
Redis.make       // build a custom implementation
Activity.make    // create an activity (effectful)
Activity.raceAll // combinator over activities
```

Modules are then re-exported from a barrel (`src/index.ts` here) as
namespaces, so consumers import the actor, not its members:

```ts
export * as Scene from "./Scene.js";
// →  import { Scene } from "effect-motion"
```

Consequences: no god-modules grouping unrelated helpers ("utils.ts",
"helpers.ts"), no class-per-entity, and a new concept means a new module
plus one barrel line — not a folder of five files.

## Wrap external APIs in Effect

Nothing that can throw or return a bare `Promise` crosses into our code
unwrapped. Third-party APIs (three.js, fonts, filesystem, image decoding,
Node builtins) get an Effect wrapper module at the boundary — the actor
module that owns them — so errors land in the error channel and resources
land in a `Scope`.

- `Effect.try` / `Effect.tryPromise` with a tagged error, not a raw throw
  or a floating promise. Tagged errors are `Data.TaggedError` subclasses —
  the repo-wide one is `EffectMotionError` (`src/EffectMotionError.ts`):

```ts
import { Data } from "effect";

export class EffectMotionError extends Data.TaggedError("EffectMotionError")<{
	readonly message: string;
	readonly cause: unknown;
}> {
	static of(message: string, cause?: unknown): EffectMotionError {
		return new EffectMotionError({ message, cause });
	}
}

// at the boundary — the throw/reject becomes a typed error channel
export const fetchBytes = (
	url: string,
): Effect.Effect<Uint8Array, EffectMotionError> =>
	Effect.tryPromise({
		try: async () => new Uint8Array(await (await fetch(url)).arrayBuffer()),
		catch: (cause) => EffectMotionError.of(`failed to fetch ${url}`, cause),
	});
```

  Reach for `EffectMotionError` first; add a new tagged error only when
  callers need to *branch* on the tag.
- Acquire/release pairs use `Effect.acquireRelease`, never manual
  try/finally cleanup.
- Callers work with the wrapper; a `new Foo()` or `await` from an external
  package appearing outside its boundary module is the smell.

### Wrapping a library that is already actor-shaped

Some libraries are themselves organized by actor — three.js is the house
example: a `Scene`, an `Object3D`, a `Material` each own their state and
the operations over it. Wrapping those is **not** a redesign. The wrapper
is a thin branding + lifecycle layer that re-cuts their methods into our
call shape, and it is mostly free.

A wrapped type is a branded handle holding the raw instance under a
`~<lib>.<thing>` key, plus `Pipeable` — the same shape as `Instance.ts`
and `Entity.ts` in the motion package:

```ts
export const TypeId = "~three/Scene" as const;

export interface Scene extends Pipeable.Pipeable {
	readonly [TypeId]: typeof TypeId;
	readonly "~three.scene": THREE.Scene;
}

export const isScene = (u: unknown): u is Scene =>
	Predicate.hasProperty(u, TypeId);

// construction owns teardown
export const make = Effect.fnUntraced(function* (): Effect.fn.Return<
	Scene,
	never,
	Scope.Scope
> {
	const scene = new THREE.Scene();
	yield* Effect.addFinalizer(() => Effect.sync(() => scene.clear()));
	return makeUnsafe(scene);
});

// sync mutation: infallible, chains
export const add = dual<
	(objects: ReadonlyArray<Object3D.Object3D>) => (self: Scene) => Scene,
	(self: Scene, objects: ReadonlyArray<Object3D.Object3D>) => Scene
>(isScene, (self, objects) => {
	self["~three.scene"].add(...objects);
	return self;
});
```

Three rules decide the shape:

1. **Effect only where it earns it.** A call that can throw or is async
   gets `Effect.try`/`tryPromise` with a tagged error. Everything else —
   `add`, `remove`, `clear`, setting a transform — stays **sync**,
   returns the handle, and chains through `.pipe`. Per-frame mutation
   runs thousands of times per frame; do not make it allocate an Effect
   to describe an infallible field write.
2. **Brand where we hold lifecycle or a rich surface.** Anything with
   `dispose`, async init, or a substantial method surface of its own
   (`Scene`, `Renderer`, `RenderTarget`, materials, geometries) gets its
   own module. Leaf value types with no lifecycle (`Object3D`,
   `Vector3`, `Color`, `Euler`) stay plain type aliases to the library's:
   `export type Object3D = THREE.Object3D;`
3. **Dual dispatch is by type guard, never arity** — the same rule as
   the animators. `dual(isScene, ...)`, not `dual((args) => args.length === 2, ...)`.

The barrel does **not** re-export the wrapped library's own namespace. A
consumer that can reach `THREE.*` will, and the boundary stops meaning
anything; make reaching for the raw library an explicit, visible import.

### Prefer Effect's built-in modules over hand-wrapping

Hand-wrapping (`tryPromise` + tagged error, as above) is for APIs that
have **no** Effect module. Where Effect ships one, use it — it already
carries typed errors, interruption, and a swappable implementation layer:

- **HTTP: `effect/unstable/http`, not raw `fetch`.** The client is a
  service, so tests swap the layer instead of mocking `fetch`:

```ts
import { Effect, Schema } from "effect";
import {
	FetchHttpClient,
	HttpClient,
	HttpClientRequest,
	HttpClientResponse,
} from "effect/unstable/http";

const getUser = Effect.fnUntraced(function* (id: string) {
	const client = yield* HttpClient.HttpClient;
	const response = yield* client.execute(
		HttpClientRequest.get(`https://api.example.com/users/${id}`),
	);
	return yield* HttpClientResponse.schemaBodyJson(User)(response);
});

// implementation provided once, at the edge
program.pipe(Effect.provide(FetchHttpClient.layer));
```

- **Filesystem: `effect/FileSystem`, not `node:fs/promises`.** Same
  shape — `scaffold.ts` in `packages/create-effect-motion` is the house
  example:

```ts
import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import { NodeServices } from "@effect/platform-node";

const write = Effect.gen(function* () {
	const fs = yield* FileSystem;
	yield* fs.writeFileString("./out.txt", "hello");
});

write.pipe(Effect.provide(NodeServices.layer), Effect.runPromise);
```

(The `fetchBytes` example above predates this rule and is grandfathered
behind its promise cache; new HTTP code goes through `HttpClient`.)

## Effectful functions are `Effect.fn`

Define effectful functions with `Effect.fn("name")` (traced — a span with
the function's name and args) or `Effect.fnUntraced` (hot/internal paths
where span overhead matters). Not an arrow returning `Effect.gen`:

```ts
// ✓ traced — shows up in spans with its arguments
const greet = Effect.fn("greet")(function* (
	who: string,
): Effect.fn.Return<string, never, never> {
	return `hello ${who}`;
});

// ✓ untraced — same shape, no span
const greetFast = Effect.fnUntraced(function* (who: string) {
	return `hello ${who}`;
});

// ✗ loses tracing, span arguments, and the improved stack traces
const greetWrong = (who: string) =>
	Effect.gen(function* () {
		return `hello ${who}`;
	});
```

The explicit `Effect.fn.Return<A, E, R>` annotation is optional — use it
when you want the signature pinned rather than inferred (public API,
recursive functions).

## Stay type-safe

The type system is one of Effect's greatest strengths — leverage it, don't
route around it.

- Casts (`as`, `as unknown as`) are an escape hatch for the cases
  TypeScript genuinely can't express — conditional return types, variance
  gaps in the middle of a generic combinator. Use them **sparingly** and
  only when there is no inference-preserving alternative; prefer fixing
  the signature over casting at the call site.
- **Never use non-null assertions (`!`)** — not in src, not in tests. When
  a value is known present but typed nullable (e.g. indexing inside a loop
  you just bounded), use the `unreachable` helper:
  `frames.at(-1) ?? unreachable()`
  (`packages/motion/test/support/raise.ts`,
  `packages/renderer/test/support/raise.ts`). It documents the invariant
  and fails loudly if it's ever wrong.
- No `biome-ignore` suppressions to get around either of the above.

## Determinism invariants (do not break)

- Duration-based animations land the final frame **exactly** on target;
  springs snap exactly on settle.
- Scenes are pure functions of `(scene, settings)` — no wall-clock, no
  `Math.random()` (seeded `Random` is provided to every scene).
- Failures are loud: missing traits, invalid springs, unknown timing
  names, and scene-graph violations die with defects naming the
  offender.
- Determinism stops at the frame stream. Same seed + settings → same
  frame count and same frame data, and browser vs headless output should
  *look* the same. Pixel-level / byte-exact rendered output is
  explicitly **not** a goal — do not design tests, tolerances, or
  architecture around it. If two renders look the same, they are the
  same.

## The engine renders, it does not parse

Push preprocessing to **userland**. The engine's job is to render a tree
of instances frame by frame; turning source material (markdown, rich
text, data files) into that tree is the author's job, done **before** the
scene runs — not inside it.

- Prefer a plain function that returns instances (or an
  instance-producing structure) over an in-engine representation. Rich
  text is a userland builder that emits `Group`/`Text` instances, not a
  schema the engine special-cases.
- This lets authors use familiar tools — `memoize(mdToComponents(md))`
  parses once, outside `Scene.make`, and never re-runs.
- It matters for playback: frames may be computed as they play, so
  parsing inside the scene body can drop frames. Keep the per-frame path
  to rendering only.

New feature that needs to *transform* content? Default to a userland
helper. Only put it in the engine if it genuinely needs runtime state
(the seeded `Random`, the phaser, per-frame instance data).

## One structure: the instance tree

There is a single tree — instances, structured by `Group.children`
(stored as an `Array<string>` of ids). Do not introduce a second
representation of structure inside an entity's data.

- **Children-defined.** `instantiate(entity, { children: [...] })` takes a
  polymorphic list — `string` (→ a `Text`), an `Instance`, or an
  `Effect<Instance>` (a not-yet-yielded `instantiate`, yielded internally
  so a future JSX layer needs no `yield*`). Stored `children` stays ids.
- **Born mounted, then moved.** An instance is born under the ambient
  parent (root, or a `Scene.play` mount). To place a lazily-created node
  elsewhere use `Scene.appendChild(parent, child)` / `removeChild` — HTML
  DOM semantics; append detaches from the current parent first (O(1) via
  tracked parent). There is no per-callsite `parent` argument.
- **Builtin instance props are `$`-namespaced.** They live *beside* entity
  data, not in the schema, so every entity has them uniformly. `$visible`
  (default `true`) is the first; renderers skip `$visible: false`.
  `Entity.make` rejects any schema field starting with `$`.
