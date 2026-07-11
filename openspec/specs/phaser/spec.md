# phaser Specification

## Purpose
TBD - created by syncing change rewrite-frame-driver. Update Purpose after review.

## Requirements

### Requirement: Phase advance on awaitAdvance
The phaser SHALL expose an `awaitAdvance` operation that advances exactly one phase: it resumes every awaiting party and resolves only when every registered party has arrived again (quiescence: `arrived === parties`).

#### Scenario: Single party steps one phase
- **WHEN** a scene with one registered party is awaiting and `awaitAdvance` is called
- **THEN** the party resumes, runs until its next `arriveAndAwaitAdvance`, and `awaitAdvance` resolves after that arrival

#### Scenario: awaitAdvance does not resolve while a party is still running
- **WHEN** `awaitAdvance` is called and one of several parties has resumed but not yet arrived
- **THEN** `awaitAdvance` remains suspended until that party arrives (or deregisters)

#### Scenario: Empty phase resolves immediately
- **WHEN** `awaitAdvance` is called and no parties are registered (scene finished or not started)
- **THEN** `awaitAdvance` resolves immediately

#### Scenario: Concurrent awaitAdvance is a defect
- **WHEN** `awaitAdvance` is called while another `awaitAdvance` is still pending
- **THEN** the second call dies with a defect (single controller)

### Requirement: Generation-safe arrival
`arriveAndAwaitAdvance` SHALL capture the current phase latch before awaiting it, and phase advance SHALL swap in a fresh latch before opening the old one, so that a party that synchronously re-arrives after resuming counts toward the new phase, never the phase being completed.

#### Scenario: Synchronous re-arrival does not complete the old phase early
- **WHEN** the phase advances and a resumed party runs and arrives again before other awaiting parties have been resumed
- **THEN** the re-arrival counts toward the new phase and the old phase's completion accounting is unaffected

### Requirement: Race-free root registration
`run(phaser, scene)` SHALL register the scene root as one party synchronously, before forking the scene fiber, and SHALL deregister it in a finalizer on success, failure, and interrupt alike.

#### Scenario: awaitAdvance called before the scene fiber first runs
- **WHEN** a scene is passed to `run`, forked, and `awaitAdvance` is called before the scene fiber has executed anything
- **THEN** `awaitAdvance` does not resolve until the scene reaches its first arrival (no startup latch required)

#### Scenario: Scene interrupted while running
- **WHEN** the scene fiber is interrupted between phases
- **THEN** its root slot is deregistered and any pending `awaitAdvance` resolves rather than hanging

### Requirement: Sequential composition via one
`one(effect)` SHALL run the wrapped effect and then arrive, without registering or deregistering any slot (it borrows its caller's party slot), so consecutive `one` calls have no handoff gap.

#### Scenario: Two sequential one calls take two phases
- **WHEN** a scene runs `one(a)` followed by `one(b)` and the controller advances twice
- **THEN** `a` runs during the first advance, `b` runs during the second advance, and neither advance resolves prematurely between them

### Requirement: Parallel composition via all (N−1 slot rule)
`all(effects)` with N branches SHALL register exactly N−1 additional party slots, run all branches concurrently, deregister one slot immediately when a branch completes while other branches are still live, and deregister nothing for the last completing branch (its slot returns to the resuming parent). A finalizer SHALL deregister all still-held slots on failure or interrupt.

#### Scenario: Parallel branches share one phase
- **WHEN** a scene runs `all([one(a), one(b), one(c)])` and the controller advances once
- **THEN** `a`, `b`, and `c` all run during that single advance and it resolves once all three have arrived

#### Scenario: Branches of different lengths
- **WHEN** one branch arrives 1 time and a sibling branch arrives 3 times
- **THEN** the short branch's completed slot is deregistered immediately and subsequent advances resolve on the surviving branch alone, with no deadlock

#### Scenario: Branch failure releases slots
- **WHEN** a branch fails, interrupting its siblings
- **THEN** all slots held by the `all` are deregistered and a pending `awaitAdvance` does not hang

### Requirement: Nested composition
Combinators SHALL compose at arbitrary depth: every combinator enters with one party slot and exits with one party slot, so an `all` nested anywhere inside a `one` or another `all` keeps `parties`/`arrived` accounting balanced.

#### Scenario: all nested inside one
- **WHEN** a scene runs `one(effectX)` where `effectX` contains `all([one(a), one(b)])`
- **THEN** the inner branches share phases per the parallel rule, the parent resumes on the last branch's slot with no registration gap, and `one`'s own trailing arrival adds one final phase boundary

#### Scenario: all nested inside all
- **WHEN** a branch of an outer `all` contains an inner `all`
- **THEN** phase stepping resolves correctly with only local slot arithmetic at each level

### Requirement: Interruption-safe accounting
A party interrupted while awaiting SHALL have its pending arrival undone (`arrived` decremented) by `arriveAndAwaitAdvance`'s cancellation handler, and every counter-touching event (arrival, deregister, awaitAdvance, arrival-cancellation) SHALL re-run the quiescence check.

#### Scenario: Awaiting party interrupted mid-phase
- **WHEN** an awaiting party's fiber is interrupted while other parties are running
- **THEN** its arrival and its owner's registration are both released and the in-flight `awaitAdvance` still resolves at quiescence of the remaining parties
