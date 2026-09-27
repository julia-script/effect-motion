## ADDED Requirements

### Requirement: A branch cut before its first step still releases its slot
A fork, background, or played scene interrupted before its fiber takes its first step (its spawner ended in the same step) SHALL release its phaser party and finish its branch exactly as if it had been interrupted mid-animation, so the scene never deadlocks waiting on it.

#### Scenario: Fork spawned as a fork's last statement
- **WHEN** a fork's body consists solely of spawning another fork, and the scene body then sleeps 100ms
- **THEN** the inner fork is cut with its spawner and the scene ends after the sleep
