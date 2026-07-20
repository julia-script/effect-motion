# resource-loaders Specification (delta)

## ADDED Requirements

### Requirement: fetchBytes memoizes per URL
`Resource.fetchBytes` SHALL cache fetched bytes per URL at module level, so repeated layer constructions (e.g. the studio's per-mount Player runtimes across scene switches) fetch each asset at most once per process. A FAILED fetch SHALL NOT be cached — the next construction retries. Custom load effects are the caller's responsibility to cache (documented alongside the helper).

#### Scenario: Second layer construction does not refetch
- **WHEN** a layer built from `fetchBytes(url)` is constructed twice in one process
- **THEN** the URL is fetched exactly once and both constructions receive the bytes

#### Scenario: Failure is retriable
- **WHEN** the first fetch of a URL fails and a later construction runs
- **THEN** the later construction fetches again rather than replaying the failure
