# branch-finish

## ADDED Requirements

### Requirement: Scene.finish finishes the innermost enclosing branch
`Scene.finish` SHALL open the innermost enclosing branch's `finished` latch and demote that branch from awaited to background: awaiters of the branch proceed, the branch stops blocking its parent's end, and its fiber keeps running with its phaser party intact. It MUST NOT interrupt or otherwise alter the branch's own execution.

#### Scenario: Tail keeps playing after finish
- **WHEN** a forked branch calls `Scene.finish` and then keeps animating
- **THEN** awaiters of the branch's `finished` latch are released immediately and the tail's frames keep rendering

#### Scenario: A finished fork no longer blocks scene end
- **WHEN** the scene body ends while a fork that called `Scene.finish` is still animating
- **THEN** the scene ends without waiting for that fork, and the tail is interrupted like a background

#### Scenario: Finish with other awaited work pending
- **WHEN** a fork finishes while another un-finished fork is still running
- **THEN** the scene keeps producing frames until the un-finished fork completes, with the finished fork's tail animating throughout

### Requirement: Completion implies finish; finish is idempotent
A branch's `finished` latch SHALL open when the branch completes (success, failure, or interruption), even if `Scene.finish` was never called. Calling `Scene.finish` twice, or finishing after completion, SHALL be a no-op — in particular, the branch MUST NOT be demoted twice (the awaited count decrements at most once per branch).

#### Scenario: Implicit finish
- **WHEN** a forked branch completes without calling `Scene.finish`
- **THEN** its `finished` latch opens at completion

#### Scenario: Finish then complete
- **WHEN** a branch calls `Scene.finish` and later completes naturally
- **THEN** the awaited count is decremented exactly once across both events

### Requirement: Branch handles expose finished and the fiber
`Scene.fork` and `Scene.play` SHALL return a branch handle exposing at least the `finished` latch and the branch's fiber, so a parent can await semantic completion and bound a tail by interruption.

#### Scenario: Crossfade sequencing
- **WHEN** a parent plays sceneA, awaits `a.finished`, then starts a fade and plays sceneB
- **THEN** sceneA's tail frames and sceneB's opening frames are produced concurrently

#### Scenario: Parent-bounded tail
- **WHEN** a parent awaits `a.finished`, sleeps 10 frames, then interrupts `a`'s fiber
- **THEN** the tail stops after those 10 frames and the parent continues normally

### Requirement: Root finish ends the movie's awaited work
`Scene.finish` in the scene body (the root branch) SHALL demote the root: once no awaited work remains, the scene is semantically over and the consumer SHALL end the frame stream, interrupting the root's tail.

#### Scenario: Body finishes and continues
- **WHEN** a top-level scene body calls `Scene.finish` and then loops forever, with no other awaited forks
- **THEN** the frame stream ends at the finish point instead of hanging
