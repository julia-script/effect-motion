## Why

`Resource.fetchBytes` calls raw `fetch()` inside `Effect.tryPromise`. Effect ships `HttpClient` (`effect/unstable/http`, present in the pinned `4.0.0-beta.98`), which carries typed errors, interruption, and a swappable `FetchHttpClient.layer` so tests replace the service instead of mocking global `fetch`. The AGENTS.md boundary convention says explicitly: `tryPromise` + a tagged error is the pattern for APIs with *no* Effect module, not a substitute for the ones that ship.

This is deferred out of the `close-the-entity-world` review deliberately (see that change's effect-patterns review, Finding 3): it is a **public-API change**, not a contained boundary fix, and it predates the entity refactor.

## What Changes

- **BREAKING** — `Resource.fetchBytes` is rewritten on `HttpClient`. Its signature gains an `R = HttpClient` requirement:
  `Effect<Uint8Array, EffectMotionError>` → `Effect<Uint8Array, EffectMotionError, HttpClient>`.
- The requirement propagates through `Font.layer`/`Image.layer` (they take a load effect) into every scene that loads a font or image. Consumers must provide `FetchHttpClient.layer` (browser) or the Node transport.
- The manual `Promise`-based module-level memo cache (`fetchCache`) is reconciled with `HttpClient`'s model — either kept as an outer memo over the effect, or replaced with a request cache, whichever composes cleanly. Failed fetches must still not cache.
- Docs examples that advertise `fetchBytes(url)` as a zero-requirement effect (`going-further/fonts.mdx`, `going-further/images.mdx`) update to show providing the transport layer.

## Capabilities

### Modified Capabilities

- `resource-loaders`: the load-effect contract gains an `HttpClient` requirement for the built-in `fetchBytes`; custom load effects are unaffected.

## Impact

**Core (`packages/motion`)** — `Resource.ts` rewritten; `Font.ts`/`Image.ts` layer signatures gain the requirement in their `R`. **Docs** — the two resource-loading examples and any studio wiring that provides scene layers. **Tests** — `test/resources.test.ts` (the memoization suite) provides `FetchHttpClient.layer` and can now swap a stub transport instead of relying on a real/flaky URL.

**Determinism unaffected** — resource bytes never enter frame data; this is purely the transport boundary.

## Notes

The alternative considered and rejected during the review was documenting a permanent exemption (leave raw `fetch`, note why). Rejected because the exemption is weak: `fetchBytes` has no hot-path justification, and the only cost of doing it right is the `R` requirement — which is the point of the pattern, not a reason to avoid it. The change is deferred for sequencing, not declined.
